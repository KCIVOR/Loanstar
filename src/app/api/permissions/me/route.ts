import { NextResponse } from "next/server";

import { resolveDisplayName } from "@/lib/account/display-name";
import {
  AuthError,
  getUserPermissions,
  requireAuth,
  toJsonError,
} from "@/lib/permissions/server";
import type { SelfPermissions } from "@/lib/permissions/types";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const user = await requireAuth();
    const permissions = await getUserPermissions(user.id);
    const supabase = await createClient();

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle();

    const fullName = resolveDisplayName(
      profile?.full_name as string | null | undefined,
      user.user_metadata?.full_name as string | undefined,
      user.email,
    );

    return NextResponse.json({
      ...permissions,
      fullName,
      email: user.email ?? null,
      avatarUrl: (profile?.avatar_url as string | null | undefined) ?? null,
    } satisfies SelfPermissions);
  } catch (error) {
    if (error instanceof AuthError) {
      return toJsonError(error, 401);
    }
    return toJsonError(error, 500);
  }
}
