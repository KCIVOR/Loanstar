import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The open Committee "Notice to Revisit" for an application — the reason the
 * file was sent back. Stored only in `revisit_notices` (Committee final
 * actions clear `loan_applications.blocker`), so CSA/CIG screens read it here.
 * RLS decides visibility: CSA reads csa-routed notices, CIG reads cig-routed.
 */
export type OpenRevisitNotice = {
  routeTo: "csa" | "cig";
  comment: string;
  createdAt: string;
};

type NoticeRow =
  | { route_to: unknown; comment: unknown; created_at: unknown }
  | null
  | undefined;

export function mapOpenRevisitNotice(row: NoticeRow): OpenRevisitNotice | null {
  if (!row) return null;
  const routeTo =
    row.route_to === "csa" || row.route_to === "cig" ? row.route_to : null;
  const comment = typeof row.comment === "string" ? row.comment.trim() : "";
  if (!routeTo || !comment) return null;
  return { routeTo, comment, createdAt: String(row.created_at ?? "") };
}

/** Latest unresolved notice. Display-only: query errors resolve to null. */
export async function getOpenRevisitNotice(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<OpenRevisitNotice | null> {
  const { data, error } = await supabase
    .from("revisit_notices")
    .select("route_to, comment, created_at")
    .eq("loan_application_id", applicationId)
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return mapOpenRevisitNotice(data);
}

/** Batch form for queues — latest open notice per application id. */
export async function getOpenRevisitNoticesByApplication(
  supabase: SupabaseClient,
  applicationIds: string[],
): Promise<Map<string, OpenRevisitNotice>> {
  const out = new Map<string, OpenRevisitNotice>();
  if (!applicationIds.length) return out;
  const { data, error } = await supabase
    .from("revisit_notices")
    .select("loan_application_id, route_to, comment, created_at")
    .in("loan_application_id", applicationIds)
    .is("resolved_at", null)
    .order("created_at", { ascending: false });
  if (error) return out;
  for (const row of data ?? []) {
    const id = row.loan_application_id as string;
    if (out.has(id)) continue;
    const mapped = mapOpenRevisitNotice(row);
    if (mapped) out.set(id, mapped);
  }
  return out;
}
