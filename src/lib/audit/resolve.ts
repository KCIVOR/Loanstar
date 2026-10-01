import type { SupabaseClient } from "@supabase/supabase-js";

import {
  areaLabel,
  describeAuditEvent,
  type AuditDetail,
  type AuditOutcome,
} from "@/lib/audit/labels";
import { childLookupTable, directApplicationId } from "@/lib/audit/link";

export type AuditEventRow = {
  id: string;
  actor_id: string | null;
  actor_role_id: string | null;
  module_slug: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
};

export const AUDIT_EVENT_COLUMNS =
  "id, actor_id, actor_role_id, module_slug, action, entity_type, entity_id, before_data, after_data, ip_address, created_at";

export type ReadableAuditEvent = {
  id: string;
  createdAt: string;
  who: {
    id: string | null;
    name: string;
    email: string | null;
    role: string | null;
    /** True when the role at the time wasn't recorded (rows before 2026-10-01). */
    roleIsCurrent: boolean;
  };
  area: string;
  summary: string;
  outcome: AuditOutcome | null;
  loan: {
    applicationId: string;
    applicationNo: string | null;
    borrowerName: string | null;
  } | null;
  details: AuditDetail[];
  technical: {
    moduleSlug: string;
    action: string;
    entityType: string | null;
    entityId: string | null;
    ipAddress: string | null;
    beforeData: Record<string, unknown> | null;
    afterData: Record<string, unknown> | null;
  };
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uniq(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((v): v is string => !!v && UUID_RE.test(v)))];
}

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Turns a page of raw audit rows into plain-language events: actor name and
 * role, loan number and borrower name, readable sentence and Before → After
 * details. Uses one batched query per lookup; call with the service client
 * only after the caller passed the `audit_log` permission check.
 */
export async function resolveAuditRows(
  service: SupabaseClient,
  rows: AuditEventRow[],
): Promise<ReadableAuditEvent[]> {
  const actorIds = uniq(rows.map((r) => r.actor_id));
  const roleIds = uniq(rows.map((r) => r.actor_role_id));

  // Loan id per row: stored directly, or through the child entity's table.
  const appIdByRow = new Map<string, string>();
  const childIds = new Map<string, string[]>();
  for (const row of rows) {
    const direct = directApplicationId(row);
    if (direct && UUID_RE.test(direct)) {
      appIdByRow.set(row.id, direct);
      continue;
    }
    const table = childLookupTable(row.entity_type);
    if (table && row.entity_id && UUID_RE.test(row.entity_id)) {
      childIds.set(table, [...(childIds.get(table) ?? []), row.entity_id]);
    }
  }

  const [profilesRes, rolesRes, currentRolesRes, ...childResults] =
    await Promise.all([
      actorIds.length
        ? service.from("profiles").select("id, full_name, email").in("id", actorIds)
        : Promise.resolve({ data: [] }),
      roleIds.length
        ? service.from("roles").select("id, name").in("id", roleIds)
        : Promise.resolve({ data: [] }),
      actorIds.length
        ? service
            .from("user_roles")
            .select("user_id, assigned_at, roles ( name )")
            .in("user_id", actorIds)
            .order("assigned_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      ...[...childIds.entries()].map(([table, ids]) =>
        service
          .from(table)
          .select("id, loan_application_id")
          .in("id", uniq(ids))
          .then((res) => ({ table, data: res.data ?? [] })),
      ),
    ]);

  const profileById = new Map<string, { full_name: string | null; email: string | null }>();
  for (const p of (profilesRes.data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
    profileById.set(p.id, p);
  }
  const roleNameById = new Map<string, string>();
  for (const r of (rolesRes.data ?? []) as Array<{ id: string; name: string }>) {
    roleNameById.set(r.id, r.name);
  }
  const currentRoleByUser = new Map<string, string>();
  for (const ur of (currentRolesRes.data ?? []) as Array<{
    user_id: string;
    roles: { name: string } | Array<{ name: string }> | null;
  }>) {
    const name = firstOf(ur.roles)?.name;
    if (name && !currentRoleByUser.has(ur.user_id)) currentRoleByUser.set(ur.user_id, name);
  }

  const appIdByChild = new Map<string, string>();
  for (const res of childResults as Array<{
    table: string;
    data: Array<{ id: string; loan_application_id: string | null }>;
  }>) {
    for (const r of res.data) {
      if (r.loan_application_id) appIdByChild.set(`${res.table}:${r.id}`, r.loan_application_id);
    }
  }
  for (const row of rows) {
    if (appIdByRow.has(row.id)) continue;
    const table = childLookupTable(row.entity_type);
    const appId = table && row.entity_id ? appIdByChild.get(`${table}:${row.entity_id}`) : undefined;
    if (appId) appIdByRow.set(row.id, appId);
  }

  const appIds = uniq([...appIdByRow.values()]);
  const loanById = new Map<string, { applicationNo: string | null; borrowerName: string | null }>();
  if (appIds.length) {
    const { data: apps } = await service
      .from("loan_applications")
      .select("id, application_no, borrowers ( first_name, last_name )")
      .in("id", appIds);
    for (const a of (apps ?? []) as Array<{
      id: string;
      application_no: string | null;
      borrowers:
        | { first_name: string | null; last_name: string | null }
        | Array<{ first_name: string | null; last_name: string | null }>
        | null;
    }>) {
      const b = firstOf(a.borrowers);
      const name = b ? [b.first_name, b.last_name].filter(Boolean).join(" ").trim() : "";
      loanById.set(a.id, { applicationNo: a.application_no, borrowerName: name || null });
    }
  }

  return rows.map((row) => {
    const d = describeAuditEvent(row);
    const profile = row.actor_id ? profileById.get(row.actor_id) : undefined;
    const recordedRole = row.actor_role_id ? roleNameById.get(row.actor_role_id) : undefined;
    const currentRole = row.actor_id ? currentRoleByUser.get(row.actor_id) : undefined;
    const appId = appIdByRow.get(row.id);
    const loan = appId ? loanById.get(appId) : undefined;
    const name = row.actor_id
      ? profile?.full_name?.trim() || profile?.email || "Deleted user"
      : "System / not signed in";

    return {
      id: row.id,
      createdAt: row.created_at,
      who: {
        id: row.actor_id,
        name,
        email: profile?.email ?? null,
        role: recordedRole ?? currentRole ?? null,
        roleIsCurrent: !recordedRole && !!currentRole,
      },
      area: areaLabel(row.module_slug),
      summary: d.summary,
      outcome: d.outcome,
      loan: appId
        ? {
            applicationId: appId,
            applicationNo: loan?.applicationNo ?? null,
            borrowerName: loan?.borrowerName ?? null,
          }
        : null,
      details: d.details,
      technical: {
        moduleSlug: row.module_slug,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        ipAddress: row.ip_address,
        beforeData: row.before_data,
        afterData: row.after_data,
      },
    };
  });
}
