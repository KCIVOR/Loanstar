import type { StatusHistoryEntry } from "@/lib/applications/status";
import type { ApplicationStatus } from "@/lib/constants";

export const CLEAR_HOLD_FALLBACK_STATUS: ApplicationStatus = "submitted";

/**
 * Restore status after clearing an on_hold: last non-on_hold entry in history.
 */
export function resolveStatusAfterClearHold(
  history: StatusHistoryEntry[] | null | undefined,
): ApplicationStatus | string {
  const entries = history ?? [];
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const status = entries[i]?.status;
    if (status && status !== "on_hold") {
      return status;
    }
  }
  return CLEAR_HOLD_FALLBACK_STATUS;
}
