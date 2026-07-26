/** Mask Twilio auth token for admin GET responses. */
export function maskTwilioAuthToken(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) return "••••";
  const last4 = trimmed.slice(-Math.min(4, trimmed.length));
  return `•••${last4}`;
}

/** True when PATCH should overwrite a secret (not a masked echo / empty). */
export function shouldApplySecretPatch(
  incoming: string | undefined | null,
): boolean {
  if (incoming == null) return false;
  const trimmed = incoming.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("•••")) return false;
  return true;
}

export function asConfigString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

export function asConfigBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return fallback;
}
