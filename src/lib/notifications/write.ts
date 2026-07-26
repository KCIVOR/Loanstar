import type { SupabaseClient } from "@supabase/supabase-js";

import type { AccountPreferences } from "@/lib/account/types";
import { createServiceClient } from "@/lib/supabase/server";

export type NotifyUserInput = {
  userId: string;
  title: string;
  body: string;
  link?: string | null;
  kind?: string | null;
  entityType?: string | null;
  entityId?: string | null;
};

export type NotifyResult =
  | { ok: true; id: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; error: string };

/** Pure: in-app off only when explicit false (fail-open). */
export function isInAppNotifyAllowed(
  preferences: AccountPreferences | null | undefined,
): boolean {
  return preferences?.notifications?.inApp !== false;
}

/**
 * Insert an in-app notification for a user (service role).
 * Honors preferences.notifications.inApp (fail-open). Never throws.
 */
export async function notifyUser(
  input: NotifyUserInput,
  client?: SupabaseClient,
): Promise<NotifyResult> {
  try {
    const supabase = client ?? createServiceClient();

    const { data: profile } = await supabase
      .from("profiles")
      .select("preferences")
      .eq("id", input.userId)
      .maybeSingle();

    const prefs = (profile?.preferences ?? {}) as AccountPreferences;
    if (!isInAppNotifyAllowed(prefs)) {
      return { ok: false, skipped: true, reason: "in_app_disabled" };
    }

    const { data, error } = await supabase
      .from("notifications")
      .insert({
        user_id: input.userId,
        title: input.title,
        body: input.body,
        link: input.link ?? null,
        kind: input.kind ?? null,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
      })
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "insert failed" };
    }
    return { ok: true, id: data.id as string };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "notify failed",
    };
  }
}

/** Resolve borrower auth user for an application and notify them. */
export async function notifyBorrowerForApplication(
  applicationId: string,
  payload: Omit<NotifyUserInput, "userId">,
  client?: SupabaseClient,
): Promise<NotifyResult> {
  try {
    const supabase = client ?? createServiceClient();
    const { data: app, error } = await supabase
      .from("loan_applications")
      .select("borrowers ( user_id )")
      .eq("id", applicationId)
      .maybeSingle();

    if (error) return { ok: false, error: error.message };

    const borrowers = app?.borrowers as
      | { user_id?: string | null }
      | Array<{ user_id?: string | null }>
      | null;
    const row = Array.isArray(borrowers) ? borrowers[0] : borrowers;
    const userId = row?.user_id ?? null;
    if (!userId) {
      return { ok: false, skipped: true, reason: "borrower_unclaimed" };
    }

    return notifyUser({ ...payload, userId }, supabase);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "notify borrower failed",
    };
  }
}
