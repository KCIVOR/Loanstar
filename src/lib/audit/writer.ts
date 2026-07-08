import { createClient } from "@/lib/supabase/server";
import { getRequestIp } from "@/lib/permissions/server";
import type { ModuleSlug } from "@/lib/permissions/types";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "execute_trigger"
  | "login"
  | "logout"
  | string;

export type WriteAuditEventInput = {
  actorId: string;
  actorRoleId?: string | null;
  moduleSlug: ModuleSlug | string;
  action: AuditAction;
  entityType?: string | null;
  entityId?: string | null;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  ipAddress?: string | null;
};

export type AuditEvent = WriteAuditEventInput & {
  id: string;
  createdAt: string;
};

/**
 * Appends an immutable row to `audit_events`.
 * RLS requires `actor_id = auth.uid()` for authenticated inserts.
 *
 * Audit logging is best-effort: callers invoke this after their primary
 * mutation has already succeeded, so a failed audit write must never turn
 * that success into an error response. Failures are logged server-side and
 * `null` is returned instead.
 */
export async function writeAuditEvent(
  input: WriteAuditEventInput,
): Promise<AuditEvent | null> {
  try {
    const supabase = await createClient();
    const ipAddress = input.ipAddress ?? (await getRequestIp());

    const { data, error } = await supabase
      .from("audit_events")
      .insert({
        actor_id: input.actorId,
        actor_role_id: input.actorRoleId ?? null,
        module_slug: input.moduleSlug,
        action: input.action,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        before_data: input.beforeData ?? null,
        after_data: input.afterData ?? null,
        ip_address: ipAddress,
      })
      .select(
        "id, actor_id, actor_role_id, module_slug, action, entity_type, entity_id, before_data, after_data, ip_address, created_at",
      )
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return {
      id: data.id,
      actorId: data.actor_id,
      actorRoleId: data.actor_role_id,
      moduleSlug: data.module_slug,
      action: data.action,
      entityType: data.entity_type,
      entityId: data.entity_id,
      beforeData: data.before_data as Record<string, unknown> | null,
      afterData: data.after_data as Record<string, unknown> | null,
      ipAddress: data.ip_address,
      createdAt: data.created_at,
    };
  } catch (error) {
    console.error(
      `Failed to write audit event (${input.moduleSlug}/${input.action}):`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
