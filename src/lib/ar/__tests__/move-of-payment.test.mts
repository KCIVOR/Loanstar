import test from "node:test";
import assert from "node:assert/strict";

import {
  applyMoveOfPayment,
  canApplyMoveOfPayment,
  listMoveOfPaymentCandidates,
  recordMoveOfPaymentSurcharge,
} from "../move-of-payment";

const FUTURE_DEADLINE = "2099-01-15";
const PAST_DEADLINE = "2000-01-15";

test("canApplyMoveOfPayment rejects when already used on this loan", () => {
  const result = canApplyMoveOfPayment({
    moveOfPaymentUsedAt: "2026-01-01T00:00:00Z",
    nextDueDateGroup: [{ id: "s1", status: "pending", lineType: "standard" }],
    paymentFrequency: "monthly",
    deadlineDate: FUTURE_DEADLINE,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /already been used/i);
});

test("canApplyMoveOfPayment rejects Invoice (weekly) loans", () => {
  const result = canApplyMoveOfPayment({
    moveOfPaymentUsedAt: null,
    nextDueDateGroup: [{ id: "s1", status: "pending", lineType: "standard" }],
    paymentFrequency: "weekly",
    deadlineDate: FUTURE_DEADLINE,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /invoice/i);
});

test("canApplyMoveOfPayment rejects when there is no open installment", () => {
  const result = canApplyMoveOfPayment({
    moveOfPaymentUsedAt: null,
    nextDueDateGroup: [],
    paymentFrequency: "monthly",
    deadlineDate: FUTURE_DEADLINE,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /no open installment/i);
});

test("canApplyMoveOfPayment rejects a deadline that isn't a real future date", () => {
  const result = canApplyMoveOfPayment({
    moveOfPaymentUsedAt: null,
    nextDueDateGroup: [{ id: "s1", status: "pending", lineType: "standard" }],
    paymentFrequency: "monthly",
    deadlineDate: PAST_DEADLINE,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /deadline/i);
});

test("canApplyMoveOfPayment rejects a group with no identifiable interest-bearing row", () => {
  // Two principal-only rows sharing a due date should never happen for a
  // real schedule, but the function must not silently pick one.
  const result = canApplyMoveOfPayment({
    moveOfPaymentUsedAt: null,
    nextDueDateGroup: [
      { id: "s1", status: "pending", lineType: "principal" },
      { id: "s2", status: "pending", lineType: "principal" },
    ],
    paymentFrequency: "quarterly",
    deadlineDate: FUTURE_DEADLINE,
  });
  assert.equal(result.ok, false);
});

test("canApplyMoveOfPayment allows a size-1 group (Monthly/Salary/Bi-Monthly)", () => {
  const result = canApplyMoveOfPayment({
    moveOfPaymentUsedAt: null,
    nextDueDateGroup: [{ id: "s1", status: "pending", lineType: "standard" }],
    paymentFrequency: "monthly",
    deadlineDate: FUTURE_DEADLINE,
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.groupInstallmentIds, ["s1"]);
});

test("canApplyMoveOfPayment allows a size-2 group (Quarterly/Two-Monthly interest+principal)", () => {
  const result = canApplyMoveOfPayment({
    moveOfPaymentUsedAt: null,
    nextDueDateGroup: [
      { id: "s1", status: "pending", lineType: "interest" },
      { id: "s2", status: "pending", lineType: "principal" },
    ],
    paymentFrequency: "quarterly",
    deadlineDate: FUTURE_DEADLINE,
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.groupInstallmentIds, ["s1", "s2"]);
});

/**
 * Integration-style coverage for applyMoveOfPayment itself (the actual
 * mutation), using the same hand-rolled Supabase-stub pattern established
 * throughout src/lib/ar/__tests__/ this session. Exercises Addendum 2 Gap 1
 * (the schedule extension). The surcharge is NOT collected by this action —
 * the Collector records it separately through the normal Record Payment
 * flow (2026-09-01 decision) — so there is no payments/DCR interaction here.
 */
type OpenRow = {
  id: string;
  installment_no: number;
  due_date: string;
  status: string;
  line_type: string;
  amount_due: number;
};

function makeMoveOfPaymentStub(opts: {
  moveOfPaymentUsedAt?: string | null;
  paymentFrequency: string;
  terms: number;
  principal: number;
  grossTotalInterest: number;
  totalInterest: number;
  releaseDate: string;
  firstPaymentDate: string;
  dueDay: number;
  openRows: OpenRow[];
  // The schedule's last installment (any status). Defaults to the
  // highest-installment_no row in openRows.
  lastRow?: { installment_no: number; due_date: string };
  // Phase 4b — when set, applyMoveOfPayment can put a PDC check on hold.
  releaseFileId?: string | null;
}) {
  const scheduleUpdates: Array<{ table: string; id: string; payload: Record<string, unknown> }> = [];
  const scheduleInserts: Array<Record<string, unknown>> = [];
  const pdcUpdates: Array<{ payload: Record<string, unknown>; filters: unknown[] }> = [];

  const lastRow =
    opts.lastRow ??
    (opts.openRows.length > 0
      ? opts.openRows.reduce((a, b) =>
          b.installment_no > a.installment_no ? b : a,
        )
      : undefined);

  const supabase = {
    from(table: string) {
      if (table === "masterlist") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: "ml-1",
                  computation_id: "comp-1",
                  move_of_payment_used_at: opts.moveOfPaymentUsedAt ?? null,
                },
                error: null,
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: async (_col: string, id: string) => {
              scheduleUpdates.push({ table: "masterlist", id, payload });
              return { error: null };
            },
          }),
        };
      }
      if (table === "computations") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  principal: opts.principal,
                  terms: opts.terms,
                  payment_frequency: opts.paymentFrequency,
                  release_date: opts.releaseDate,
                  first_payment_date: opts.firstPaymentDate,
                  due_day: opts.dueDay,
                  total_interest: opts.totalInterest,
                  gross_total_interest: opts.grossTotalInterest,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "amortization_schedules") {
        return {
          select: (cols: string) => ({
            eq: () => ({
              // openRows: .eq().in().order().order()
              in: () => ({
                order: () => ({
                  order: async () => ({ data: opts.openRows, error: null }),
                }),
              }),
              // lastRow: .eq().order().limit()
              order: () => ({
                limit: async () => ({
                  data: cols === "installment_no, due_date" && lastRow ? [lastRow] : [],
                  error: null,
                }),
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: async (_col: string, id: string) => {
              scheduleUpdates.push({ table: "amortization_schedules", id, payload });
              return { error: null };
            },
          }),
          insert: async (rows: Record<string, unknown>[]) => {
            scheduleInserts.push(...rows);
            return { error: null };
          },
        };
      }
      if (table === "release_files") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: opts.releaseFileId ? { id: opts.releaseFileId } : null,
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "pdc_checks") {
        return {
          update: (payload: Record<string, unknown>) => ({
            eq: (...f1: unknown[]) => ({
              eq: (...f2: unknown[]) => ({
                eq: async (...f3: unknown[]) => {
                  pdcUpdates.push({ payload, filters: [...f1, ...f2, ...f3] });
                  return { error: null };
                },
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  return {
    supabase: supabase as never,
    getScheduleUpdates: () => scheduleUpdates,
    getScheduleInserts: () => scheduleInserts,
    getPdcUpdates: () => pdcUpdates,
  };
}

test("applyMoveOfPayment: size-1 group (Monthly) moves the row and appends one final installment", async () => {
  const stub = makeMoveOfPaymentStub({
    paymentFrequency: "monthly",
    terms: 6,
    principal: 100000,
    // Discounted computation: gross 17013 vs stored net 10000 — proves the
    // function reads gross, not net (F10-style regression guard).
    grossTotalInterest: 17013,
    totalInterest: 10000,
    releaseDate: "2026-08-31",
    firstPaymentDate: "2026-09-30",
    dueDay: 30,
    openRows: [
      { id: "s1", installment_no: 1, due_date: "2026-09-30", status: "pending", line_type: "standard", amount_due: 20000 },
      { id: "s2", installment_no: 2, due_date: "2026-10-30", status: "pending", line_type: "standard", amount_due: 20000 },
    ],
    lastRow: { installment_no: 6, due_date: "2027-02-28" },
  });

  const result = await applyMoveOfPayment(
    stub.supabase,
    "ml-1",
    "actor-1",
    "2026-09-25",
    "2026-09-30",
  );

  assert.deepEqual(result.groupInstallmentIds, ["s1"]);
  assert.equal(result.deadlineDate, "2026-09-25");
  // 17013 gross interest / 6 terms = 2835.50 per month.
  assert.equal(result.surchargeAmount, 2835.5);
  // 2027-02-28 + 1 month, anchored on the last row's own day (28) -> 2027-03-28.
  assert.equal(result.extensionDueDate, "2027-03-28");
  assert.deepEqual(result.extensionInstallmentNos, [7]);

  // The moved row.
  const scheduleUpdates = stub.getScheduleUpdates().filter((u) => u.table === "amortization_schedules");
  assert.equal(scheduleUpdates.length, 1);
  assert.equal(scheduleUpdates[0]?.id, "s1");
  assert.equal(scheduleUpdates[0]?.payload.status, "moved");
  assert.equal(scheduleUpdates[0]?.payload.move_surcharge_amount, 2835.5);

  // The appended final installment.
  assert.equal(stub.getScheduleInserts().length, 1);
  const ext = stub.getScheduleInserts()[0]!;
  assert.equal(ext.installment_no, 7);
  assert.equal(ext.due_date, "2027-03-28");
  assert.equal(ext.amount_due, 20000);
  assert.equal(ext.status, "pending");
  assert.equal(ext.line_type, "standard");
  assert.equal(ext.penalty_amount, 0);
  assert.ok(ext.deferred_from_move_of_payment_batch_id);
  assert.equal(ext.move_of_payment_batch_id, undefined);
  assert.equal(ext.deferred_from_move_of_payment_batch_id, result.batchId);

  // One-time-use stamp.
  const masterlistUpdates = stub.getScheduleUpdates().filter((u) => u.table === "masterlist");
  assert.equal(masterlistUpdates.length, 1);
  assert.ok(masterlistUpdates[0]?.payload.move_of_payment_used_at);

  // No release file in this fixture → no PDC check held.
  assert.equal(stub.getPdcUpdates().length, 0);
});

test("applyMoveOfPayment: puts the moved installment's PDC check on hold (Fixes Plan Phase 4b)", async () => {
  const stub = makeMoveOfPaymentStub({
    paymentFrequency: "monthly",
    terms: 6,
    principal: 100000,
    grossTotalInterest: 17013,
    totalInterest: 10000,
    releaseDate: "2026-08-31",
    firstPaymentDate: "2026-09-30",
    dueDay: 30,
    openRows: [
      { id: "s1", installment_no: 1, due_date: "2026-09-30", status: "pending", line_type: "standard", amount_due: 20000 },
      { id: "s2", installment_no: 2, due_date: "2026-10-30", status: "pending", line_type: "standard", amount_due: 20000 },
    ],
    lastRow: { installment_no: 6, due_date: "2027-02-28" },
    releaseFileId: "rf-1",
  });

  const result = await applyMoveOfPayment(
    stub.supabase,
    "ml-1",
    "actor-1",
    "2026-09-25",
    "2026-09-30",
  );

  const pdc = stub.getPdcUpdates();
  assert.equal(pdc.length, 1);
  assert.equal(pdc[0]?.payload.status, "held");
  assert.equal(pdc[0]?.payload.move_of_payment_batch_id, result.batchId);
  // Check is the one at sort_order = installment_no - 1 = 0.
  assert.ok(pdc[0]?.filters.includes(0));
});

test("applyMoveOfPayment: Quarterly (size-2 group) does NOT touch PDC checks", async () => {
  const stub = makeMoveOfPaymentStub({
    paymentFrequency: "quarterly",
    terms: 6,
    principal: 100000,
    grossTotalInterest: 6000,
    totalInterest: 6000,
    releaseDate: "2026-08-31",
    firstPaymentDate: "2026-11-30",
    dueDay: 30,
    openRows: [
      { id: "s1", installment_no: 1, due_date: "2026-11-30", status: "pending", line_type: "interest", amount_due: 3000 },
      { id: "s2", installment_no: 2, due_date: "2026-11-30", status: "pending", line_type: "principal", amount_due: 47000 },
      { id: "s3", installment_no: 3, due_date: "2027-02-28", status: "pending", line_type: "interest", amount_due: 3000 },
      { id: "s4", installment_no: 4, due_date: "2027-02-28", status: "pending", line_type: "principal", amount_due: 47000 },
    ],
    lastRow: { installment_no: 4, due_date: "2027-02-28" },
    releaseFileId: "rf-1",
  });

  await applyMoveOfPayment(stub.supabase, "ml-1", "actor-1", "2026-11-25", "2026-11-30");

  assert.equal(stub.getPdcUpdates().length, 0, "check lifecycle is 1:1-frequency only");
});

test("applyMoveOfPayment: size-2 group (Quarterly) moves both rows and appends TWO final installments (interest + principal)", async () => {
  const stub = makeMoveOfPaymentStub({
    paymentFrequency: "quarterly",
    terms: 6,
    principal: 100000,
    grossTotalInterest: 6000, // 2 quarterly units of 3000 each
    totalInterest: 6000,
    releaseDate: "2026-08-31",
    firstPaymentDate: "2026-11-30",
    dueDay: 30,
    openRows: [
      { id: "s1", installment_no: 1, due_date: "2026-11-30", status: "pending", line_type: "interest", amount_due: 3000 },
      { id: "s2", installment_no: 2, due_date: "2026-11-30", status: "pending", line_type: "principal", amount_due: 47000 },
      { id: "s3", installment_no: 3, due_date: "2027-02-28", status: "pending", line_type: "interest", amount_due: 3000 },
      { id: "s4", installment_no: 4, due_date: "2027-02-28", status: "pending", line_type: "principal", amount_due: 47000 },
    ],
    lastRow: { installment_no: 4, due_date: "2027-02-28" },
  });

  const result = await applyMoveOfPayment(
    stub.supabase,
    "ml-1",
    "actor-1",
    "2026-11-25",
    "2026-11-30",
  );

  assert.deepEqual(result.groupInstallmentIds, ["s1", "s2"]);
  assert.equal(result.surchargeAmount, 3000);
  // 2027-02-28 + 3 months, anchored on the last row's own day (28) -> 2027-05-28.
  assert.equal(result.extensionDueDate, "2027-05-28");
  assert.deepEqual(result.extensionInstallmentNos, [5, 6]);

  const scheduleUpdates = stub
    .getScheduleUpdates()
    .filter((u) => u.table === "amortization_schedules")
    .sort((a, b) => a.id.localeCompare(b.id));
  assert.equal(scheduleUpdates.length, 2);
  assert.equal(scheduleUpdates.find((u) => u.id === "s1")?.payload.move_surcharge_amount, 3000);
  assert.equal(scheduleUpdates.find((u) => u.id === "s2")?.payload.move_surcharge_amount, 0);

  // Two appended rows, one per line type, same due date, same batch id.
  const exts = stub.getScheduleInserts();
  assert.equal(exts.length, 2);
  assert.deepEqual(
    exts.map((r) => r.installment_no).sort((a, b) => (a as number) - (b as number)),
    [5, 6],
  );
  assert.deepEqual(
    exts.map((r) => r.line_type).sort(),
    ["interest", "principal"],
  );
  assert.ok(exts.every((r) => r.due_date === "2027-05-28"));
  assert.ok(
    exts.every((r) => r.deferred_from_move_of_payment_batch_id === result.batchId),
  );
  assert.equal(exts.find((r) => r.line_type === "interest")?.amount_due, 3000);
  assert.equal(exts.find((r) => r.line_type === "principal")?.amount_due, 47000);
});

/**
 * Regression coverage for Phase 5 / the manual-selection addendum —
 * listMoveOfPaymentCandidates is the read-only, multi-candidate sibling of
 * applyMoveOfPayment. It must never write anything.
 */
test("listMoveOfPaymentCandidates: lists every open due date with its real surcharge, writes nothing", async () => {
  const stub = makeMoveOfPaymentStub({
    paymentFrequency: "monthly",
    terms: 6,
    principal: 100000,
    grossTotalInterest: 17013,
    totalInterest: 10000,
    releaseDate: "2026-08-31",
    firstPaymentDate: "2026-09-30",
    dueDay: 30,
    openRows: [
      { id: "s1", installment_no: 1, due_date: "2026-09-30", status: "pending", line_type: "standard", amount_due: 20000 },
      { id: "s2", installment_no: 2, due_date: "2026-10-30", status: "pending", line_type: "standard", amount_due: 20000 },
    ],
  });

  const result = await listMoveOfPaymentCandidates(stub.supabase, "ml-1");

  assert.equal(result.eligible, true);
  if (result.eligible) {
    assert.deepEqual(
      result.candidates.map((c) => c.dueDate),
      ["2026-09-30", "2026-10-30"],
    );
    assert.equal(result.candidates[0]?.surchargeAmount, 2835.5);
    assert.equal(result.candidates[1]?.surchargeAmount, 2835.5);
  }
  assert.equal(stub.getScheduleUpdates().length, 0, "listing candidates must never write");
  assert.equal(stub.getScheduleInserts().length, 0);
});

test("applyMoveOfPayment: manual pick of a later (non-earliest) due date moves only that group", async () => {
  const stub = makeMoveOfPaymentStub({
    paymentFrequency: "monthly",
    terms: 6,
    principal: 100000,
    grossTotalInterest: 17013,
    totalInterest: 10000,
    releaseDate: "2026-08-31",
    firstPaymentDate: "2026-09-30",
    dueDay: 30,
    openRows: [
      { id: "s1", installment_no: 1, due_date: "2026-09-30", status: "pending", line_type: "standard", amount_due: 20000 },
      { id: "s2", installment_no: 2, due_date: "2026-10-30", status: "pending", line_type: "standard", amount_due: 20000 },
    ],
    lastRow: { installment_no: 6, due_date: "2027-02-28" },
  });

  const result = await applyMoveOfPayment(
    stub.supabase,
    "ml-1",
    "actor-1",
    "2026-10-25",
    "2026-10-30",
  );

  assert.deepEqual(result.groupInstallmentIds, ["s2"]);
  const scheduleUpdates = stub.getScheduleUpdates().filter((u) => u.table === "amortization_schedules");
  assert.equal(scheduleUpdates.length, 1);
  assert.equal(scheduleUpdates[0]?.id, "s2");
  assert.equal(scheduleUpdates[0]?.payload.status, "moved");
});

test("listMoveOfPaymentCandidates: reports ineligible with the real reason when already used", async () => {
  const stub = makeMoveOfPaymentStub({
    moveOfPaymentUsedAt: "2026-01-01T00:00:00Z",
    paymentFrequency: "monthly",
    terms: 6,
    principal: 100000,
    grossTotalInterest: 17013,
    totalInterest: 10000,
    releaseDate: "2026-08-31",
    firstPaymentDate: "2026-09-30",
    dueDay: 30,
    openRows: [
      { id: "s1", installment_no: 1, due_date: "2026-09-30", status: "pending", line_type: "standard", amount_due: 20000 },
    ],
  });

  const result = await listMoveOfPaymentCandidates(stub.supabase, "ml-1");

  assert.equal(result.eligible, false);
  if (!result.eligible) assert.match(result.reason, /already been used/i);
  assert.equal(stub.getScheduleUpdates().length, 0);
});

test("listMoveOfPaymentCandidates: reports ineligible for Invoice (weekly) loans", async () => {
  const stub = makeMoveOfPaymentStub({
    paymentFrequency: "weekly",
    terms: 3,
    principal: 100000,
    grossTotalInterest: 5000,
    totalInterest: 5000,
    releaseDate: "2026-08-31",
    firstPaymentDate: "2026-09-07",
    dueDay: 7,
    openRows: [
      { id: "s1", installment_no: 1, due_date: "2026-09-07", status: "pending", line_type: "standard", amount_due: 35000 },
    ],
  });

  const result = await listMoveOfPaymentCandidates(stub.supabase, "ml-1");

  assert.equal(result.eligible, false);
  if (!result.eligible) assert.match(result.reason, /invoice/i);
});

/**
 * Fixes Plan Phase 2 (Issue 3) — recordMoveOfPaymentSurcharge inserts the
 * surcharge for an in-effect move as a real, tagged `payments` row, without
 * touching schedules or `move_of_payment_used_at`.
 */
function makeSurchargeStub(opts: {
  movedRows: Array<{ move_of_payment_batch_id: string | null; move_surcharge_amount: number }>;
  existingSurchargePayment?: { id: string } | null;
}) {
  const inserts: Array<Record<string, unknown>> = [];

  const supabase = {
    from(table: string) {
      if (table === "amortization_schedules") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                not: async () => ({ data: opts.movedRows, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "payments") {
        return {
          select: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: opts.existingSurchargePayment ?? null,
                  error: null,
                }),
              }),
            }),
          }),
          insert: (payload: Record<string, unknown>) => {
            inserts.push({ table: "payments", ...payload });
            return {
              select: () => ({
                single: async () => ({ data: { id: "surcharge-pay-1" }, error: null }),
              }),
            };
          },
        };
      }
      if (table === "masterlist") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { loan_application_id: "la-1", borrower_id: "b-1" },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  return { supabase: supabase as never, getInserts: () => inserts };
}

const SURCHARGE_INPUT = {
  referenceNo: "MOP-SUR-1",
  channel: "bank_deposit" as const,
  paymentDate: "2026-09-05",
};

test("recordMoveOfPaymentSurcharge: inserts a confirmed, batch-tagged payment for a size-1 move", async () => {
  const stub = makeSurchargeStub({
    movedRows: [{ move_of_payment_batch_id: "batch-1", move_surcharge_amount: 2835.5 }],
  });

  const result = await recordMoveOfPaymentSurcharge(stub.supabase, "ml-1", "actor-1", SURCHARGE_INPUT);

  assert.equal(result.paymentId, "surcharge-pay-1");
  assert.equal(result.batchId, "batch-1");
  assert.equal(result.amount, 2835.5);

  const insert = stub.getInserts().find((i) => i.table === "payments");
  assert.ok(insert);
  assert.equal(insert!.amount, 2835.5);
  assert.equal(insert!.status, "confirmed");
  assert.equal(insert!.channel, "bank_deposit");
  assert.equal(insert!.reference_no, "MOP-SUR-1");
  assert.equal(insert!.move_of_payment_batch_id, "batch-1");
  assert.equal(insert!.notes, "Move of Payment surcharge");
  assert.equal(insert!.masterlist_id, "ml-1");
});

test("recordMoveOfPaymentSurcharge: size-2 move — amount is the interest row's surcharge only", async () => {
  const stub = makeSurchargeStub({
    movedRows: [
      { move_of_payment_batch_id: "batch-2", move_surcharge_amount: 3000 },
      { move_of_payment_batch_id: "batch-2", move_surcharge_amount: 0 },
    ],
  });

  const result = await recordMoveOfPaymentSurcharge(stub.supabase, "ml-1", "actor-1", SURCHARGE_INPUT);

  assert.equal(result.amount, 3000);
  assert.equal(result.batchId, "batch-2");
});

test("recordMoveOfPaymentSurcharge: rejects when there is no active move", async () => {
  const stub = makeSurchargeStub({ movedRows: [] });
  await assert.rejects(
    () => recordMoveOfPaymentSurcharge(stub.supabase, "ml-1", "actor-1", SURCHARGE_INPUT),
    /no active Move of Payment/i,
  );
  assert.equal(stub.getInserts().length, 0);
});

test("recordMoveOfPaymentSurcharge: rejects when the surcharge was already recorded", async () => {
  const stub = makeSurchargeStub({
    movedRows: [{ move_of_payment_batch_id: "batch-1", move_surcharge_amount: 2835.5 }],
    existingSurchargePayment: { id: "already-there" },
  });
  await assert.rejects(
    () => recordMoveOfPaymentSurcharge(stub.supabase, "ml-1", "actor-1", SURCHARGE_INPUT),
    /already been recorded/i,
  );
  assert.equal(stub.getInserts().length, 0);
});
