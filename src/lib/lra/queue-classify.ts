import type { ReleaseFileStatus } from "@/lib/lra/constants";

export type LraQueueBucket = "setup" | "briefing" | "ready" | "completed" | "other";

export type LraQueueClassifyInput = {
  applicationStatus: string | null | undefined;
  blocker: string | null | undefined;
  releaseFileStatus: string | null | undefined;
};

const COMPLETED_APP_STATUSES = new Set(["paid_off", "closed"]);
const COMPLETED_RELEASE_STATUSES = new Set(["released", "closed"]);
// awaiting_signatures is LRA work: the in-branch signing session.
const SETUP_RELEASE_STATUSES = new Set([
  "awaiting_path",
  "pdc_encoding",
  "ready_generate",
  "awaiting_signatures",
]);
// awaiting_briefing waits on the Collection Head's check-off.
const BRIEFING_RELEASE_STATUSES = new Set(["awaiting_briefing"]);

export function isCompletedLraQueueItem(
  input: LraQueueClassifyInput,
): boolean {
  if (
    input.releaseFileStatus &&
    COMPLETED_RELEASE_STATUSES.has(input.releaseFileStatus)
  ) {
    return true;
  }
  if (
    input.applicationStatus &&
    COMPLETED_APP_STATUSES.has(input.applicationStatus)
  ) {
    return true;
  }
  if (input.blocker?.startsWith("Released")) {
    return true;
  }
  return false;
}

export function lraQueueBucket(input: LraQueueClassifyInput): LraQueueBucket {
  if (isCompletedLraQueueItem(input)) return "completed";

  const release = input.releaseFileStatus as ReleaseFileStatus | null | undefined;
  if (release && SETUP_RELEASE_STATUSES.has(release)) return "setup";
  if (release && BRIEFING_RELEASE_STATUSES.has(release)) return "briefing";
  if (release === "ready_release") return "ready";

  // Fallback when release_files row is missing — use blocker text.
  const blocker = input.blocker ?? "";
  if (
    /release path|PDC not yet|document generation|signatures/i.test(blocker)
  ) {
    return "setup";
  }
  if (/awaiting briefing/i.test(blocker)) {
    return "briefing";
  }
  if (/awaiting check release|awaiting cash release/i.test(blocker)) {
    return "ready";
  }

  return "other";
}
