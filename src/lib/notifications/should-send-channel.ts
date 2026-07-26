import type { SupabaseClient } from "@supabase/supabase-js";

import { isChannelSendAllowed } from "@/lib/account/preferences";
import type { AccountPreferences } from "@/lib/account/types";

export type ChannelPreferenceDecision = {
  allowed: boolean;
  /** Why we allowed or skipped — for reminder skip reasons / audit. */
  reason?: string;
};

/**
 * Pure fail-open evaluation (Phase 0.3 Decision A).
 * Missing userId / prefs / channel key ⇒ allow. Explicit false ⇒ skip.
 */
export function evaluateChannelPreference(
  userId: string | null | undefined,
  preferences: AccountPreferences | null | undefined,
  channel: "email" | "sms",
): ChannelPreferenceDecision {
  if (!userId) {
    return { allowed: true, reason: "no_user_id" };
  }
  if (preferences == null) {
    return { allowed: true, reason: "preferences_missing" };
  }
  const value = preferences.notifications?.[channel];
  if (value === undefined) {
    return { allowed: true, reason: "channel_key_missing" };
  }
  if (isChannelSendAllowed(preferences, channel)) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: `preferences.notifications.${channel}=false`,
  };
}

/**
 * Load profiles.preferences for userId and evaluate channel preference.
 * Fail-open when row missing or userId null.
 */
export async function shouldSendChannel(
  supabase: SupabaseClient,
  userId: string | null | undefined,
  channel: "email" | "sms",
): Promise<ChannelPreferenceDecision> {
  if (!userId) {
    return evaluateChannelPreference(null, null, channel);
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return { allowed: true, reason: "profile_missing" };
  }

  return evaluateChannelPreference(
    userId,
    (data.preferences ?? {}) as AccountPreferences,
    channel,
  );
}
