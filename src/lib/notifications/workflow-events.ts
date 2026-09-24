import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceClient } from "@/lib/supabase/server";

import {
  formatApplicationLabel,
  WORKFLOW_EVENTS,
  type WorkflowEventKey,
} from "./workflow-catalog";
import {
  getRoleUserIds,
  uniqueRecipientsExcluding,
} from "./workflow-recipients";
import {
  notifyBorrowerForApplication,
  notifyUser,
  type NotifyUserInput,
} from "./write";

type Options = {
  /** The user who caused the event — never notified about their own action. */
  actorId?: string | null;
  /** Optional extra context appended to the message body. */
  detail?: string;
};

/** Notify every user holding one of the roles. Never throws. */
export async function notifyRoles(
  roleSlugs: string[],
  payload: Omit<NotifyUserInput, "userId">,
  options: { actorId?: string | null; client?: SupabaseClient } = {},
): Promise<void> {
  try {
    const client = options.client ?? createServiceClient();
    const ids = uniqueRecipientsExcluding(
      await getRoleUserIds(client, roleSlugs),
      options.actorId,
    );
    await Promise.all(ids.map((userId) => notifyUser({ ...payload, userId }, client)));
  } catch {
    /* notifications are best-effort */
  }
}

async function loadLabel(
  client: SupabaseClient,
  applicationId: string,
): Promise<{ label: string; endorsedBy: string | null }> {
  const { data } = await client
    .from("loan_applications")
    .select("application_no, endorsed_by, borrowers ( first_name, last_name )")
    .eq("id", applicationId)
    .maybeSingle();

  const raw = data?.borrowers as
    | { first_name?: string | null; last_name?: string | null }
    | Array<{ first_name?: string | null; last_name?: string | null }>
    | null
    | undefined;
  const borrower = Array.isArray(raw) ? raw[0] : raw;
  const name = [borrower?.first_name, borrower?.last_name]
    .filter(Boolean)
    .join(" ");

  return {
    label: formatApplicationLabel(
      (data?.application_no as string | null) ?? null,
      name,
    ),
    endorsedBy: (data?.endorsed_by as string | null) ?? null,
  };
}

/**
 * Dispatch a catalogued workflow notification for an application. The
 * audience, copy and link come from WORKFLOW_EVENTS. Best-effort: never
 * throws and never affects the business action that triggered it.
 */
export async function notifyWorkflowEvent(
  key: WorkflowEventKey,
  applicationId: string,
  options: Options = {},
): Promise<void> {
  try {
    const def = WORKFLOW_EVENTS[key];
    const client = createServiceClient();
    const { label, endorsedBy } = await loadLabel(client, applicationId);

    const payload: Omit<NotifyUserInput, "userId"> = {
      title: def.title,
      body: def.body(label, options.detail),
      link: def.link(applicationId),
      kind: key,
      entityType: "loan_application",
      entityId: applicationId,
    };

    if ("borrower" in def.audience) {
      await notifyBorrowerForApplication(applicationId, payload, client);
      return;
    }

    if ("endorserOrCsa" in def.audience) {
      if (endorsedBy && endorsedBy !== options.actorId) {
        await notifyUser({ ...payload, userId: endorsedBy }, client);
        return;
      }
      await notifyRoles(["csa"], payload, { actorId: options.actorId, client });
      return;
    }

    await notifyRoles(def.audience.roles, payload, {
      actorId: options.actorId,
      client,
    });
  } catch {
    /* notifications are best-effort */
  }
}

/**
 * Notify one user about a loan account (masterlist row), e.g. a collector or
 * remedial officer receiving an assignment. Best-effort; never throws.
 */
export async function notifyMasterlistUser(
  masterlistId: string,
  userId: string | null | undefined,
  content: {
    kind: string;
    title: string;
    body: (accountLabel: string) => string;
    link: string;
  },
  options: { actorId?: string | null } = {},
): Promise<void> {
  if (!userId || userId === options.actorId) return;
  try {
    const client = createServiceClient();
    const { data } = await client
      .from("masterlist")
      .select("loan_account_no, borrower_name")
      .eq("id", masterlistId)
      .maybeSingle();
    const label = formatApplicationLabel(
      (data?.loan_account_no as string | null) ?? null,
      (data?.borrower_name as string | null) ?? null,
    );
    await notifyUser(
      {
        userId,
        title: content.title,
        body: content.body(label),
        link: content.link,
        kind: content.kind,
        entityType: "masterlist",
        entityId: masterlistId,
      },
      client,
    );
  } catch {
    /* notifications are best-effort */
  }
}

/**
 * Notify the collector/remedial officer who owns a DCRR (by report or by one
 * of its items). Best-effort; never throws.
 */
export async function notifyDcrOwner(
  ref: { dcrId?: string; itemId?: string },
  content: { kind: string; title: string; body: string },
  options: { actorId?: string | null } = {},
): Promise<void> {
  try {
    const client = createServiceClient();
    let dcrId = ref.dcrId ?? null;
    if (!dcrId && ref.itemId) {
      const { data: item } = await client
        .from("dcr_items")
        .select("dcr_id")
        .eq("id", ref.itemId)
        .maybeSingle();
      dcrId = (item?.dcr_id as string | null) ?? null;
    }
    if (!dcrId) return;

    const { data: dcr } = await client
      .from("dcr")
      .select("collector_user_id")
      .eq("id", dcrId)
      .maybeSingle();
    const ownerId = (dcr?.collector_user_id as string | null) ?? null;
    if (!ownerId || ownerId === options.actorId) return;

    await notifyUser(
      {
        userId: ownerId,
        title: content.title,
        body: content.body,
        link: "/collector/dcr/history",
        kind: content.kind,
        entityType: "dcr",
        entityId: dcrId,
      },
      client,
    );
  } catch {
    /* notifications are best-effort */
  }
}
