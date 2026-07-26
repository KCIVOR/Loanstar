import type {
  AccountNotificationPreferences,
  AccountPreferences,
  AccountPreferencesPatch,
  AccountSelfPatch,
  MergeAccountPreferencesOptions,
  NotificationChannel,
} from "./types";

/** Keys never accepted on self-service account PATCH. */
export const ACCOUNT_SELF_PATCH_FORBIDDEN_KEYS = [
  "is_active",
  "email",
  "id",
  "avatar_url",
  "avatarUrl",
  "roleIds",
  "roles",
] as const;

const ALLOWED_SELF_KEYS = ["fullName", "phone", "preferences"] as const;

/**
 * Pick only allowlisted self-patch fields from an arbitrary JSON body.
 * avatar_url is intentionally excluded — Phase 3 avatar API only.
 */
export function pickAccountSelfPatch(
  input: Record<string, unknown>,
): AccountSelfPatch {
  const out: AccountSelfPatch = {};

  if ("fullName" in input && typeof input.fullName === "string") {
    out.fullName = input.fullName;
  }
  if ("phone" in input) {
    if (input.phone === null) {
      out.phone = null;
    } else if (typeof input.phone === "string") {
      out.phone = input.phone;
    }
  }
  if (
    "preferences" in input &&
    input.preferences != null &&
    typeof input.preferences === "object" &&
    !Array.isArray(input.preferences)
  ) {
    out.preferences = input.preferences as AccountPreferencesPatch;
  }

  // Explicitly ignore forbidden / other keys (ALLOWED_SELF_KEYS documents allowlist).
  void ALLOWED_SELF_KEYS;

  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/** Keep only known notification keys; optionally drop email/sms until Phase 6. */
function sanitizeNotifications(
  notes: AccountNotificationPreferences | null | undefined,
  allowChannelKeys: boolean,
): AccountNotificationPreferences | undefined {
  if (!notes) return undefined;
  const next: AccountNotificationPreferences = {};
  if (typeof notes.inApp === "boolean") next.inApp = notes.inApp;
  if (allowChannelKeys) {
    if (typeof notes.email === "boolean") next.email = notes.email;
    if (typeof notes.sms === "boolean") next.sms = notes.sms;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * Deep-merge preferences for storage. Does not invent channel keys.
 * Strips unknown notification keys. Strips email/sms unless allowChannelKeys.
 */
export function mergeAccountPreferences(
  existing: AccountPreferences | null | undefined,
  patch: AccountPreferencesPatch | null | undefined,
  options: MergeAccountPreferencesOptions = {},
): AccountPreferences {
  const allowChannelKeys = options.allowChannelKeys === true;
  const baseNotes = sanitizeNotifications(
    existing?.notifications,
    allowChannelKeys,
  );
  const base: AccountPreferences = {
    ...(typeof existing?.timezone === "string"
      ? { timezone: existing.timezone }
      : {}),
    ...(typeof existing?.locale === "string" ? { locale: existing.locale } : {}),
    ...(baseNotes ? { notifications: baseNotes } : {}),
  };

  if (!patch) return base;

  const next: AccountPreferences = { ...base };

  if (typeof patch.timezone === "string") {
    next.timezone = patch.timezone;
  }
  if (typeof patch.locale === "string") {
    next.locale = patch.locale;
  }

  if (isPlainObject(patch.notifications)) {
    const mergedNotes: AccountNotificationPreferences = {
      ...(next.notifications ?? {}),
    };
    const patchNotes = patch.notifications as AccountNotificationPreferences;

    if (typeof patchNotes.inApp === "boolean") {
      mergedNotes.inApp = patchNotes.inApp;
    }
    if (allowChannelKeys) {
      if (typeof patchNotes.email === "boolean") {
        mergedNotes.email = patchNotes.email;
      }
      if (typeof patchNotes.sms === "boolean") {
        mergedNotes.sms = patchNotes.sms;
      }
    }

    const sanitized = sanitizeNotifications(mergedNotes, allowChannelKeys);
    if (sanitized) next.notifications = sanitized;
    else delete next.notifications;
  }

  return next;
}

/** Read-path defaults — do not write these back on every GET. */
export function resolveAccountPreferences(
  stored: AccountPreferences | null | undefined,
): Required<Pick<AccountPreferences, "notifications">> & AccountPreferences {
  const notifications = {
    inApp: stored?.notifications?.inApp ?? true,
    email: stored?.notifications?.email ?? true,
    sms: stored?.notifications?.sms ?? true,
  };
  return {
    ...stored,
    notifications,
  };
}

/**
 * GET response helper: raw stored prefs + in-memory resolved defaults.
 * Never writes to the database.
 */
export function preparePreferencesResponse(
  stored: AccountPreferences | null | undefined,
): {
  stored: AccountPreferences;
  resolved: ReturnType<typeof resolveAccountPreferences>;
} {
  const safeStored: AccountPreferences = { ...(stored ?? {}) };
  return {
    stored: safeStored,
    resolved: resolveAccountPreferences(safeStored),
  };
}

/**
 * Fail-open channel gate (Phase 0 contract / Phase 6 helper).
 * Missing profile, prefs, notifications object, or channel key ⇒ allow.
 * Explicit false ⇒ skip.
 */
export function isChannelSendAllowed(
  preferences: AccountPreferences | null | undefined,
  channel: Exclude<NotificationChannel, "inApp">,
): boolean {
  const value = preferences?.notifications?.[channel];
  if (value === undefined) return true;
  return value !== false;
}
