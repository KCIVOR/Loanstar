import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchAllRows } from "@/lib/reports/paginate";

import { summarizeQueue, type RawBottleneck } from "./rank";

/**
 * Days each queue is allowed before it counts as stuck.
 *
 * Where a queue maps onto a stage transition already governed by `TAT_PAIRS`
 * in `src/lib/reports/aggregates.ts`, the target is copied from there so the
 * two never disagree. The rest are set here because no TAT pair covers them:
 * a hold, an unverified payment proof and an unprocessed AR handoff are all
 * things that sit outside the application status ladder.
 */
export const QUEUE_TARGET_DAYS = {
  /** TAT_PAIRS: for_verification -> for_approval */
  cigVerification: 5,
  /** TAT_PAIRS: approved -> lra_pending */
  releaseQueue: 3,
  /** TAT_PAIRS: lra_pending -> closed */
  releaseFile: 5,
  /** Post-approval negotiation: no TAT pair; one working week */
  negotiation: 5,
  /** A hold is already an exception — three days is generous */
  hold: 3,
  /** AR should pick up a released file the next working day */
  arQueue: 2,
  /** Proof sitting unverified delays the borrower's ledger */
  proof: 3,
} as const;

/** Application statuses where downstream work is legitimately finished or dead. */
const SETTLED_APPLICATION_STATUSES = new Set([
  "released",
  "closed",
  "loan_active",
  "paid_off",
  "denied",
  "cancelled",
]);

const RELEASE_FILE_DONE = new Set(["released", "closed"]);
const NEGOTIATION_OPEN = new Set(["pending_disclosure", "awaiting_signature"]);

type IdStatus = { id: string; status: string | null };
type Verification = { loan_application_id: string; is_complete: boolean | null; created_at: string | null };
type ReleaseFile = { loan_application_id: string; status: string | null; created_at: string | null };
type ReleaseQueue = { loan_application_id: string; queued_at: string | null };
type Negotiation = { loan_application_id: string; status: string | null; created_at: string | null };
type FileHold = { loan_application_id: string; resolved_at: string | null; created_at: string | null };
type ArQueue = { queued_at: string | null; processed_at: string | null };
type Payment = { status: string | null; created_at: string | null };

/**
 * The six operational queues the reports module has never read, plus the proof
 * backlog. Origination stuck files are added separately in `index.ts` because
 * they already have their own SLA logic.
 */
export async function fetchQueueSources(
  supabase: SupabaseClient,
  now = new Date(),
): Promise<RawBottleneck[]> {
  const [apps, verifications, releaseFiles, releaseQueue, negotiations, holds, arQueue, payments] =
    await Promise.all([
      fetchAllRows<IdStatus>(supabase, {
        table: "loan_applications",
        columns: "id, status",
        order: "id",
      }),
      fetchAllRows<Verification>(supabase, {
        table: "verifications",
        columns: "loan_application_id, is_complete, created_at",
        order: "id",
      }),
      fetchAllRows<ReleaseFile>(supabase, {
        table: "release_files",
        columns: "loan_application_id, status, created_at",
        order: "id",
      }),
      fetchAllRows<ReleaseQueue>(supabase, {
        table: "release_queue",
        columns: "loan_application_id, queued_at",
        order: "id",
      }),
      fetchAllRows<Negotiation>(supabase, {
        table: "negotiations",
        columns: "loan_application_id, status, created_at",
        order: "id",
      }),
      fetchAllRows<FileHold>(supabase, {
        table: "file_holds",
        columns: "loan_application_id, resolved_at, created_at",
        order: "id",
      }),
      fetchAllRows<ArQueue>(supabase, {
        table: "ar_queue",
        columns: "queued_at, processed_at",
        order: "id",
      }),
      fetchAllRows<Payment>(supabase, {
        table: "payments",
        columns: "status, created_at",
        order: "id",
      }),
    ]);

  const statusByApp = new Map(apps.map((a) => [a.id, a.status ?? ""]));
  const isLive = (applicationId: string): boolean =>
    !SETTLED_APPLICATION_STATUSES.has(statusByApp.get(applicationId) ?? "");

  const cig = summarizeQueue(
    verifications
      .filter((v) => v.is_complete !== true && isLive(v.loan_application_id))
      .map((v) => v.created_at),
    now,
  );

  const files = summarizeQueue(
    releaseFiles
      .filter((f) => !RELEASE_FILE_DONE.has(f.status ?? ""))
      .map((f) => f.created_at),
    now,
  );

  const queue = summarizeQueue(
    releaseQueue.filter((q) => isLive(q.loan_application_id)).map((q) => q.queued_at),
    now,
  );

  const negotiation = summarizeQueue(
    negotiations
      .filter((n) => NEGOTIATION_OPEN.has(n.status ?? "") && isLive(n.loan_application_id))
      .map((n) => n.created_at),
    now,
  );

  const hold = summarizeQueue(
    holds.filter((h) => !h.resolved_at).map((h) => h.created_at),
    now,
  );

  const ar = summarizeQueue(
    arQueue.filter((r) => !r.processed_at).map((r) => r.queued_at),
    now,
  );

  const proof = summarizeQueue(
    payments.filter((p) => p.status === "pending_verification").map((p) => p.created_at),
    now,
  );

  return [
    {
      id: "bottleneck.cig",
      stage: "Credit investigation not finished",
      owner: "CIG",
      ...cig,
      targetDays: QUEUE_TARGET_DAYS.cigVerification,
    },
    {
      id: "bottleneck.releaseQueue",
      stage: "Waiting to be picked up for release",
      owner: "LRA",
      ...queue,
      targetDays: QUEUE_TARGET_DAYS.releaseQueue,
    },
    {
      id: "bottleneck.releaseFile",
      stage: "Release file not yet released",
      owner: "LRA",
      ...files,
      targetDays: QUEUE_TARGET_DAYS.releaseFile,
    },
    {
      id: "bottleneck.negotiation",
      stage: "Negotiation not signed",
      owner: "CSA",
      ...negotiation,
      targetDays: QUEUE_TARGET_DAYS.negotiation,
    },
    {
      id: "bottleneck.hold",
      stage: "File on hold",
      owner: "CSA",
      ...hold,
      targetDays: QUEUE_TARGET_DAYS.hold,
    },
    {
      id: "bottleneck.arQueue",
      stage: "Released file awaiting AR setup",
      owner: "AR",
      ...ar,
      targetDays: QUEUE_TARGET_DAYS.arQueue,
    },
    {
      id: "bottleneck.proof",
      stage: "Payment proof unverified",
      owner: "AR",
      ...proof,
      targetDays: QUEUE_TARGET_DAYS.proof,
    },
  ];
}
