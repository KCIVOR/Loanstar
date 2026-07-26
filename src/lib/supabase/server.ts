import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Next.js patches the global `fetch` and caches responses across HMR
// refreshes in dev — even for requests with `cache: "no-store"` — unless the
// request explicitly opts out via `next: { revalidate: 0 }`. Without this,
// reads through the Supabase REST API can return stale data immediately
// after a write. See node_modules/next/dist/docs/.../serverComponentsHmrCache.md.
const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: "no-store", next: { revalidate: 0 } });

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: noStoreFetch },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component — cookie writes are ignored.
          }
        },
      },
    },
  );
}

/** Service-role client for server-only operations (email, bootstrap, etc.). */
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: { fetch: noStoreFetch },
    },
  );
}
