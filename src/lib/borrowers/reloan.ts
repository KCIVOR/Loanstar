/** Terminal statuses that do not block starting a new reloan. */
export const RELOAN_TERMINAL_STATUSES = ["paid_off", "denied"] as const;

export type ReloanEligibilityResult =
  | { ok: true }
  | { ok: false; reason: string };

export type NextApplicationKind = "first" | "reloan";

/**
 * A borrower may start a reloan only when every existing application is
 * terminal (paid off or denied). Any in-flight application blocks another.
 * An empty history is allowed (first application).
 */
export function canStartReloan(input: {
  applicationStatuses: string[];
}): ReloanEligibilityResult {
  const open = input.applicationStatuses.filter(
    (status) =>
      !(RELOAN_TERMINAL_STATUSES as readonly string[]).includes(status),
  );

  if (open.length > 0) {
    return {
      ok: false,
      reason:
        "You already have an ongoing application. Finish or wait for it to close before starting another.",
    };
  }

  return { ok: true };
}

/**
 * What kind of application the borrower may open next, or null if blocked.
 * Empty history → first loan; only terminal apps → reloan.
 */
export function nextApplicationKind(input: {
  applicationStatuses: string[];
}): NextApplicationKind | null {
  if (!canStartReloan(input).ok) return null;
  return input.applicationStatuses.length === 0 ? "first" : "reloan";
}

/**
 * A borrower may hold at most one 'draft' (pre-submission) application at a
 * time. "Start application" resumes that draft instead of erroring or
 * creating a duplicate — canStartReloan's "ongoing application" block would
 * otherwise permanently lock out anyone who starts a draft and abandons it,
 * since 'draft' is not a terminal status. Callers should check this BEFORE
 * calling canStartReloan.
 */
export function findResumableDraft<T extends { id: string; status: string }>(
  applications: T[],
): T | null {
  return applications.find((app) => app.status === "draft") ?? null;
}
