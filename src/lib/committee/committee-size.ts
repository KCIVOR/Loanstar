import { createServiceClient } from "@/lib/supabase/server";

import { DEFAULT_COMMITTEE_SIZE } from "./votes";

/**
 * Reads admin `config_settings.committee_size` via service role.
 *
 * Server-only (imports next/headers transitively via createServiceClient) —
 * kept out of votes.ts because that file is also imported by client
 * components (e.g. src/app/committee/page.tsx, for `tatTone`), and a
 * server-only import there breaks the client bundle.
 *
 * Uses the service client (not the caller's RLS-scoped session) because this
 * is a global, staff-agnostic admin setting — every committee role needs the
 * real configured value regardless of their own `system_config` permission
 * (most non-super-admin staff don't have it, so a session-scoped read would
 * silently see zero rows and fall back to the default).
 */
export async function getCommitteeSize(): Promise<number> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("config_settings")
    .select("value")
    .eq("key", "committee_size")
    .maybeSingle();

  const raw = data?.value;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 1) {
    return Math.floor(raw);
  }
  if (typeof raw === "string") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 1) return Math.floor(n);
  }
  return DEFAULT_COMMITTEE_SIZE;
}
