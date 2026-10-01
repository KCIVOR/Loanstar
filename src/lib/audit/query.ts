import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { AUDIT_KIND_FILTERS, AUDIT_KINDS } from "@/lib/audit/labels";
import { CHILD_TABLE_NAMES } from "@/lib/audit/link";
import { AUDIT_EVENT_COLUMNS } from "@/lib/audit/resolve";

/** Activity Log filters — query params from the viewer, validated here. */
export const auditFilterSchema = z.object({
  actorId: z.string().uuid().optional(),
  module: z.string().regex(/^[a-z_]{2,40}$/).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  applicationNo: z.string().trim().min(1).max(40).optional(),
  kind: z.enum(AUDIT_KINDS).optional(),
});

export type AuditFilters = z.infer<typeof auditFilterSchema>;

const FILTER_KEYS = ["actorId", "module", "from", "to", "applicationNo", "kind"] as const;

export function parseAuditFilters(params: URLSearchParams): AuditFilters {
  const raw: Record<string, string> = {};
  for (const key of FILTER_KEYS) {
    const v = params.get(key);
    if (v) raw[key] = v;
  }
  return auditFilterSchema.parse(raw);
}

/** Manila day boundaries (UTC+8, no DST) for the inclusive date filter. */
function manilaStart(date: string): string {
  return new Date(`${date}T00:00:00+08:00`).toISOString();
}

function manilaEndExclusive(date: string): string {
  const d = new Date(`${date}T00:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

/**
 * Runs the filtered `audit_events` query for rows `[start, end]`. Returns
 * `null` when a loan-number filter matches no loan (caller answers with an
 * empty page). The builder is awaited here, not returned: a query builder is
 * thenable, so returning it from an async function would execute it early.
 */
export async function fetchAuditPage(
  service: SupabaseClient,
  filters: AuditFilters,
  opts: { count?: boolean; start: number; end: number },
) {
  let query = service
    .from("audit_events")
    .select(AUDIT_EVENT_COLUMNS, opts.count ? { count: "exact" } : undefined)
    .order("created_at", { ascending: false });

  if (filters.actorId) query = query.eq("actor_id", filters.actorId);
  if (filters.module) query = query.eq("module_slug", filters.module);
  if (filters.from) query = query.gte("created_at", manilaStart(filters.from));
  if (filters.to) query = query.lt("created_at", manilaEndExclusive(filters.to));
  if (filters.kind && filters.kind !== "all") {
    query = query.or(AUDIT_KIND_FILTERS[filters.kind]);
  }

  if (filters.applicationNo) {
    const { data: app } = await service
      .from("loan_applications")
      .select("id")
      .ilike("application_no", filters.applicationNo)
      .maybeSingle();
    if (!app) return null;
    const appId = app.id as string;

    // Events on the loan itself, events naming it in after_data, and events
    // on its child records (release file, account, documents, payments, …).
    const childLists = await Promise.all(
      CHILD_TABLE_NAMES.map((table) =>
        service.from(table).select("id").eq("loan_application_id", appId).limit(500),
      ),
    );
    const childIds = childLists.flatMap((r) =>
      ((r.data ?? []) as Array<{ id: string }>).map((x) => x.id),
    );
    const ors = [`entity_id.eq.${appId}`, `after_data->>applicationId.eq.${appId}`];
    if (childIds.length) ors.push(`entity_id.in.(${childIds.join(",")})`);
    query = query.or(ors.join(","));
  }

  return await query.range(opts.start, opts.end);
}
