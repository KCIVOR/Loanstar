/**
 * Account Settings contracts (Phase 0).
 *
 * Product decisions (Phase 0.3):
 * - Decision A: channel keys absent ⇒ send (fail-open); explicit false ⇒ skip.
 * - Decision B: when Phase 6 UI first shows toggles, default email/SMS on for
 *   borrower reminder parity; staff operational emails stay ungated.
 * - Do not persist notifications.email / notifications.sms until Phase 6.
 */

export type NotificationChannel = "email" | "sms" | "inApp";

export type AccountNotificationPreferences = {
  inApp?: boolean;
  email?: boolean;
  sms?: boolean;
};

export type AccountPreferences = {
  timezone?: string;
  locale?: string;
  notifications?: AccountNotificationPreferences;
};

export type AccountPreferencesPatch = {
  timezone?: string;
  locale?: string;
  notifications?: AccountNotificationPreferences;
};

/** Allowlisted body fields for self-service PATCH /api/account (Phase 2). */
export type AccountSelfPatch = {
  fullName?: string;
  phone?: string | null;
  preferences?: AccountPreferencesPatch;
};

export type MergeAccountPreferencesOptions = {
  /** When false (default until Phase 6), strip email/sms from the patch. */
  allowChannelKeys?: boolean;
};
