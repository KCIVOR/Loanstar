import { createServiceClient } from "@/lib/supabase/server";

import { DEFAULT_COMMITTEE_SIZE } from "./votes";

/**
 * Segment → config_settings key for committee size.
 * NULL/unknown must not silently fall back to Seafarer.
 */
export function committeeSizeConfigKey(
  segment: string | null | undefined,
): "committee_size" | "committee_size_sme" | "committee_size_individual" {
  if (segment === "sme") return "committee_size_sme";
  if (segment === "individual") return "committee_size_individual";
  if (segment === "seafarer") return "committee_size";
  throw new Error(
    `loan_applications.segment is missing or unknown (${segment ?? "null"}) — cannot choose committee size`,
  );
}

export function resolveCommitteeSize(
  segment: string | null | undefined,
  sizes: { seafarer: number; sme: number; individual: number },
): number {
  const key = committeeSizeConfigKey(segment);
  if (key === "committee_size_sme") return sizes.sme;
  if (key === "committee_size_individual") return sizes.individual;
  return sizes.seafarer;
}

/**
 * Reads admin `config_settings.committee_size` / `committee_size_sme` via service role.
 *
 * Server-only (imports next/headers transitively via createServiceClient) —
 * kept out of votes.ts because that file is also imported by client
 * components (e.g. src/app/committee/page.tsx, for `tatTone`), and a
 * server-only import there breaks the client bundle.
 *
 * Uses the service client (not the caller's RLS-scoped session) because these
 * are global, staff-agnostic admin settings — every committee role needs the
 * real configured value regardless of their own `system_config` permission
 * (most non-super-admin staff don't have it, so a session-scoped read would
 * silently see zero rows and fall back to the default).
 */
export async function getCommitteeSize(
  segment: string | null | undefined,
): Promise<number> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("config_settings")
    .select("key, value")
    .in("key", ["committee_size", "committee_size_sme", "committee_size_individual"]);

  let seafarer = DEFAULT_COMMITTEE_SIZE;
  let sme = DEFAULT_COMMITTEE_SIZE;
  let individual = DEFAULT_COMMITTEE_SIZE;
  for (const row of data ?? []) {
    const n = Number(row.value);
    if (row.key === "committee_size" && Number.isFinite(n) && n >= 1) {
      seafarer = Math.floor(n);
    }
    if (row.key === "committee_size_sme" && Number.isFinite(n) && n >= 1) {
      sme = Math.floor(n);
    }
    if (row.key === "committee_size_individual" && Number.isFinite(n) && n >= 1) {
      individual = Math.floor(n);
    }
  }
  return resolveCommitteeSize(segment, { seafarer, sme, individual });
}
