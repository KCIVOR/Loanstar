import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { fetchActiveProfile, isActiveProfile } from "@/lib/permissions/active-profile";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabaseResponse, user: null };
  }

  // Same active-profile gate as requireAuth()/page.tsx, run against the
  // edge-scoped client middleware already has (no next/headers cookies()
  // available here, so requireAuth() itself can't run in this file).
  const profile = await fetchActiveProfile(supabase, user.id);
  if (!isActiveProfile(profile)) {
    // Clear the stale/deactivated session cookies via the supported SSR
    // sign-out convention so a cached browser tab doesn't keep presenting
    // a token that will never pass the active-profile check again.
    await supabase.auth.signOut();
    return { supabaseResponse, user: null };
  }

  return { supabase, supabaseResponse, user };
}
