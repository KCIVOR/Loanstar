import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AMORTIZATION_SCHEDULE_LEDGER_COLUMNS,
  buildAccountLedgerRows,
  checkNumbersByInstallmentNo,
  ledgerEntriesFromPostings,
  mapScheduleRowForLedger,
  type LedgerPaymentEntry,
  type LedgerSchedule,
} from "../build-account-ledger-rows";

const schedules: LedgerSchedule[] = [
  {
    id: "s1",
    dueDate: "2026-02-15",
    target: 1000,
    penalty: 0,
    installmentNo: 1,
    checkNo: "1351",
    status: "pending",
  },
  {
    id: "s2",
    dueDate: "2026-03-15",
    target: 1000,
    penalty: 50,
    installmentNo: 2,
    checkNo: "151",
    status: "pending",
  },
];

function payment(
  partial: Partial<LedgerPaymentEntry> &
    Pick<LedgerPaymentEntry, "id" | "paymentDate" | "amount">,
): LedgerPaymentEntry {
  return {
    referenceNo: null,
    channel: "bank_deposit",
    status: "posted",
    scheduleId: null,
    ...partial,
  };
}

describe("buildAccountLedgerRows", () => {
  it("creates an opening debit row with starting balance", () => {
    const rows = buildAccountLedgerRows({
      openingDebit: 5000,
      schedules,
      payments: [],
    });

    assert.equal(rows[0]?.kind, "opening");
    assert.equal(rows[0]?.debit, 5000);
    assert.equal(rows[0]?.credit, null);
    assert.equal(rows[0]?.balance, 5000);
    assert.equal(rows.at(-1)?.kind, "totals");
    // Report Total debit = principal (5000) + s2's ₱50 accrued late fee.
    assert.equal(rows.at(-1)?.debit, 5050);
    assert.equal(rows.at(-1)?.credit, 0);
    assert.equal(rows.at(-1)?.balance, 5050);
  });

  it("lists unpaid installments with check no, target, penalty and status", () => {
    const rows = buildAccountLedgerRows({
      openingDebit: 5000,
      schedules,
      payments: [],
    });

    const installments = rows.filter((row) => row.kind === "installment");
    assert.equal(installments.length, 2);
    assert.equal(installments[0]?.checkNo, "1351");
    assert.equal(installments[0]?.dueDate, "2026-02-15");
    assert.equal(installments[0]?.target, 1000);
    assert.equal(installments[0]?.penalty, 0);
    assert.equal(installments[0]?.status, "pending");
    assert.equal(installments[0]?.date, null);
    assert.equal(installments[0]?.credit, null);
    // Balance carries forward untouched while nothing is collected — save for
    // an accrued late fee, which is a debit (s1 has none).
    assert.equal(installments[0]?.balance, 5000);
    assert.equal(installments[1]?.checkNo, "151");
    assert.equal(installments[1]?.penalty, 50);
    // s2's ₱50 late fee folds into the running balance when its row is emitted.
    assert.equal(installments[1]?.balance, 5050);
  });

  it("orders installments by installment number, not input order", () => {
    const rows = buildAccountLedgerRows({
      openingDebit: 3000,
      schedules: [...schedules].reverse(),
      payments: [],
    });

    const installments = rows.filter((row) => row.kind === "installment");
    assert.deepEqual(
      installments.map((row) => row.dueDate),
      ["2026-02-15", "2026-03-15"],
    );
  });

  it("applies posted credits under their installment and reduces balance", () => {
    const rows = buildAccountLedgerRows({
      openingDebit: 5000,
      schedules: [
        { ...schedules[0]!, status: "paid" },
        { ...schedules[1]!, status: "partial" },
      ],
      payments: [
        payment({
          id: "p2",
          paymentDate: "2026-03-01",
          amount: 1000,
          referenceNo: "CHK-2",
          scheduleId: "s2",
        }),
        payment({
          id: "p1",
          paymentDate: "2026-02-01",
          amount: 1000,
          referenceNo: "CHK-1",
          scheduleId: "s1",
        }),
      ],
    });

    assert.equal(rows.filter((row) => row.kind === "installment").length, 0);
    const credits = rows.filter((row) => row.kind === "payment");
    assert.equal(credits.length, 2);
    // LRA check number wins over the payment reference on the Check No. column.
    assert.equal(credits[0]?.checkNo, "1351");
    assert.equal(credits[0]?.status, "paid");
    assert.equal(credits[0]?.balance, 4000);
    assert.equal(credits[1]?.checkNo, "151");
    assert.equal(credits[1]?.status, "partial");
    // 5000 − 1000 (s1) + 50 (s2 late fee) − 1000 (s2) = 3050.
    assert.equal(credits[1]?.balance, 3050);
    assert.equal(credits[1]?.dueDate, "2026-03-15");
    assert.equal(credits[1]?.target, 1000);
    assert.equal(credits[1]?.penalty, 50);
    assert.equal(rows.at(-1)?.credit, 2000);
    assert.equal(rows.at(-1)?.debit, 5050);
    assert.equal(rows.at(-1)?.balance, 3050);
  });

  it("keeps multiple credits on one installment in payment-date order", () => {
    const rows = buildAccountLedgerRows({
      openingDebit: 5000,
      schedules,
      payments: [
        payment({
          id: "late",
          paymentDate: "2026-02-20",
          amount: 400,
          scheduleId: "s1",
        }),
        payment({
          id: "early",
          paymentDate: "2026-02-05",
          amount: 600,
          scheduleId: "s1",
        }),
      ],
    });

    const credits = rows.filter((row) => row.kind === "payment");
    assert.deepEqual(
      credits.map((row) => row.date),
      ["2026-02-05", "2026-02-20"],
    );
    assert.deepEqual(
      credits.map((row) => row.balance),
      [4400, 4000],
    );
    // Installment 2 is still unpaid and keeps its own row.
    assert.equal(rows.filter((row) => row.kind === "installment").length, 1);
  });

  it("tags payment rows with their installment's scheduleId, for grouping partials in the UI", () => {
    const rows = buildAccountLedgerRows({
      openingDebit: 5000,
      schedules,
      payments: [
        payment({
          id: "late",
          paymentDate: "2026-02-20",
          amount: 400,
          scheduleId: "s1",
        }),
        payment({
          id: "early",
          paymentDate: "2026-02-05",
          amount: 600,
          scheduleId: "s1",
        }),
        payment({
          id: "advance",
          paymentDate: "2026-02-01",
          amount: 200,
          referenceNo: "CHK-9",
        }),
      ],
    });

    const credits = rows.filter((row) => row.kind === "payment");
    assert.deepEqual(
      credits.map((row) => row.scheduleId),
      ["s1", "s1", null],
    );
  });

  it("excludes non-posted payments from running balance", () => {
    const rows = buildAccountLedgerRows({
      openingDebit: 5000,
      schedules,
      payments: [
        payment({
          id: "pending",
          paymentDate: "2026-02-01",
          amount: 1000,
          status: "pending_verification",
          referenceNo: "PEND",
          scheduleId: "s1",
        }),
        payment({
          id: "confirmed",
          paymentDate: "2026-02-02",
          amount: 500,
          status: "confirmed",
          referenceNo: "CONF",
          scheduleId: "s1",
        }),
        payment({
          id: "posted",
          paymentDate: "2026-02-03",
          amount: 800,
          status: "posted",
          referenceNo: "POST",
          scheduleId: "s1",
        }),
      ],
    });

    const credits = rows.filter((row) => row.kind === "payment");
    assert.equal(credits.length, 1);
    assert.equal(credits[0]?.date, "2026-02-03");
    assert.equal(credits[0]?.balance, 4200);
  });

  it("lists credits with no installment link last, with blank schedule cells", () => {
    const rows = buildAccountLedgerRows({
      openingDebit: 1000,
      schedules,
      payments: [
        payment({
          id: "advance",
          paymentDate: "2026-02-01",
          amount: 200,
          referenceNo: "CHK-9",
          channel: "check",
        }),
      ],
    });

    const credit = rows.find((row) => row.kind === "payment");
    assert.equal(rows.at(-2)?.key, "payment:advance");
    // Check No. is LRA-issued checks only — no fallback to the payment's own
    // reference, since that now has its own dedicated column.
    assert.equal(credit?.checkNo, null);
    assert.equal(credit?.dueDate, null);
    assert.equal(credit?.target, null);
    assert.equal(credit?.penalty, null);
    assert.equal(credit?.status, null);
    assert.equal(credit?.referenceNo, "CHK-9");
  });

  it("shows Target net of any origination discount, not the gross amount (2026-08-31)", () => {
    const rows = buildAccountLedgerRows({
      openingDebit: 5000,
      schedules: [
        { ...schedules[0]!, target: 1080, discount: 1080 }, // fully waived
        { ...schedules[1]!, target: 2160, discount: 2160 * 0.5 }, // half waived
      ],
      payments: [],
    });

    const installments = rows.filter((row) => row.kind === "installment");
    assert.equal(installments[0]?.target, 0);
    assert.equal(installments[0]?.discount, 1080);
    assert.equal(installments[1]?.target, 1080);
    assert.equal(installments[1]?.discount, 1080);
  });

  it("shows Target net of discount on payment rows too", () => {
    const rows = buildAccountLedgerRows({
      openingDebit: 5000,
      schedules: [{ ...schedules[0]!, target: 1080, discount: 1080, status: "paid" }],
      payments: [
        payment({ id: "p1", paymentDate: "2026-02-01", amount: 0, scheduleId: "s1" }),
      ],
    });

    const credit = rows.find((row) => row.kind === "payment");
    assert.equal(credit?.target, 0);
    assert.equal(credit?.discount, 1080);
  });

  it("Report Total reconciles to 0 after a Collector discount closes the account (2026-09-09)", () => {
    // Two ₱1,000 installments. #1 paid in full. #2: borrower pays ₱600, a
    // ₱400 Collector interest discount closes the rest.
    const rows = buildAccountLedgerRows({
      openingDebit: 2000,
      schedules: [
        { ...schedules[0]!, target: 1000, status: "paid" },
        {
          ...schedules[1]!,
          target: 1000,
          penalty: 0,
          discount: 400,
          discountSource: "collector",
          status: "paid",
        },
      ],
      payments: [
        payment({ id: "p1", paymentDate: "2026-02-16", amount: 1000, scheduleId: "s1" }),
        payment({ id: "p2", paymentDate: "2026-03-16", amount: 600, scheduleId: "s2" }),
      ],
    });
    // Was ₱400 (the discount) before the fix.
    assert.equal(rows.at(-1)?.balance, 0);
  });

  it("folds accrued late fees into Report Total so it matches the stored outstanding balance (2026-09-09)", () => {
    // Mirrors live AN300459: 12 × ₱74,800 principal. #1 paid late in full
    // (₱74,800 + ₱3,740 fee). #2 overdue, ₱1,683 fee, paid ₱41,140 partial.
    // Stored outstanding_balance counts penalty_amount, so the ledger must too.
    const twelve: LedgerSchedule[] = Array.from({ length: 12 }, (_, i) => ({
      id: `n${i + 1}`,
      dueDate: `2026-${String(i + 1).padStart(2, "0")}-08`,
      target: 74_800,
      penalty: i === 0 ? 3_740 : i === 1 ? 1_683 : 0,
      installmentNo: i + 1,
      status: i === 0 ? "paid" : i === 1 ? "overdue" : "pending",
    }));
    const rows = buildAccountLedgerRows({
      openingDebit: 897_600,
      schedules: twelve,
      payments: [
        payment({ id: "p1", paymentDate: "2026-09-09", amount: 78_540, scheduleId: "n1" }),
        payment({ id: "p2", paymentDate: "2026-09-09", amount: 41_140, scheduleId: "n2" }),
      ],
    });
    const totals = rows.at(-1);
    assert.equal(totals?.kind, "totals");
    // 897,600 principal + 3,740 + 1,683 late fees.
    assert.equal(totals?.debit, 903_023);
    assert.equal(totals?.credit, 119_680);
    // debit − credit identity holds, and equals recompute_outstanding_balance.
    assert.equal(totals?.balance, 783_343);
  });

  it("a penalty waiver (penaltyDiscount) is netted out of the folded-in late fee", () => {
    const rows = buildAccountLedgerRows({
      openingDebit: 2000,
      schedules: [
        { ...schedules[0]!, target: 1000, penalty: 0, status: "pending" },
        { ...schedules[1]!, target: 1000, penalty: 200, penaltyDiscount: 200, status: "overdue" },
      ],
      payments: [],
    });
    // 200 fee fully waived → nothing folded in.
    assert.equal(rows.at(-1)?.debit, 2000);
    assert.equal(rows.at(-1)?.balance, 2000);
  });

  it("does NOT double-subtract an origination / null-source discount (already in openingDebit)", () => {
    const rows = buildAccountLedgerRows({
      // openingDebit already net of the ₱400 origination discount on s2.
      openingDebit: 1600,
      schedules: [
        { ...schedules[0]!, target: 1000, status: "paid" },
        { ...schedules[1]!, target: 1000, penalty: 0, discount: 400, discountSource: null, status: "paid" },
      ],
      payments: [
        payment({ id: "p1", paymentDate: "2026-02-16", amount: 1000, scheduleId: "s1" }),
        payment({ id: "p2", paymentDate: "2026-03-16", amount: 600, scheduleId: "s2" }),
      ],
    });
    assert.equal(rows.at(-1)?.balance, 0);
  });

  it("surfaces the carried-in breakdown on a rolled-into installment (Phase 5b)", () => {
    const rows = buildAccountLedgerRows({
      openingDebit: 30000,
      schedules: [
        {
          ...schedules[1]!,
          id: "s2",
          target: 20000, // 10,000 own + 10,000 carried
          penalty: 500,
          carriedInterest: 10000,
          carriedPenalty: 500,
          carriedFromInstallmentNo: 1,
          status: "pending",
        },
      ],
      payments: [],
    });
    const inst = rows.find((r) => r.kind === "installment");
    assert.equal(inst?.carriedInterest, 10000);
    assert.equal(inst?.carriedPenalty, 500);
    assert.equal(inst?.carriedFrom, 1);
  });

  it("leaves carried fields null on an ordinary installment", () => {
    const rows = buildAccountLedgerRows({
      openingDebit: 2000,
      schedules: [{ ...schedules[0]!, target: 1000 }],
      payments: [],
    });
    const inst = rows.find((r) => r.kind === "installment");
    assert.equal(inst?.carriedInterest, null);
    assert.equal(inst?.carriedFrom, null);
  });

  it("flattens postings into ledger payment entries", () => {
    const entries = ledgerEntriesFromPostings([
      {
        id: "post-1",
        amount: 250,
        amortization_schedule_id: "s1",
        payments: {
          payment_date: "2026-02-10",
          reference_no: "REF-1",
          channel: "bank_deposit",
          status: "posted",
        },
      },
      {
        id: "post-2",
        amount: 100,
        amortization_schedule_id: null,
        payments: [
          {
            payment_date: "2026-02-11",
            reference_no: null,
            channel: null,
            status: null,
          },
        ],
      },
    ]);

    assert.equal(entries.length, 2);
    assert.deepEqual(entries[0], {
      id: "post-1",
      paymentDate: "2026-02-10",
      amount: 250,
      penaltyPortion: 0,
      referenceNo: "REF-1",
      channel: "bank_deposit",
      status: "posted",
      scheduleId: "s1",
      moveOfPaymentBatchId: null,
    });
    assert.equal(entries[1]?.scheduleId, null);
    assert.equal(entries[1]?.channel, "payment");
    assert.equal(entries[1]?.status, "posted");
  });
});

describe("buildAccountLedgerRows — hides Quarterly/Two-Monthly Special's $0 placeholder rows", () => {
  it("hides a genuinely all-zero row but keeps the real row on the same due date", () => {
    const rows = buildAccountLedgerRows({
      openingDebit: 120_000,
      schedules: [
        {
          id: "interest-1",
          dueDate: "2026-12-10",
          target: 2_500,
          penalty: 0,
          installmentNo: 1,
          status: "pending",
        },
        {
          id: "principal-placeholder-1",
          dueDate: "2026-12-10",
          target: 0,
          penalty: 0,
          discount: 0,
          installmentNo: 2,
          status: "pending",
        },
        {
          id: "interest-final",
          dueDate: "2027-09-10",
          target: 2_500,
          penalty: 0,
          installmentNo: 3,
          status: "pending",
        },
        {
          id: "principal-final",
          dueDate: "2027-09-10",
          target: 120_000,
          penalty: 0,
          installmentNo: 4,
          status: "pending",
        },
      ],
      payments: [],
    });

    const scheduleIds = rows
      .filter((r) => r.kind === "installment")
      .map((r) => r.scheduleId);
    assert.deepEqual(scheduleIds, ["interest-1", "interest-final", "principal-final"]);
    assert.ok(!scheduleIds.includes("principal-placeholder-1"));
  });

  it("never hides a $0 row that has a real payment posted against it", () => {
    const rows = buildAccountLedgerRows({
      openingDebit: 120_000,
      schedules: [
        {
          id: "principal-placeholder-1",
          dueDate: "2026-12-10",
          target: 0,
          penalty: 0,
          discount: 0,
          installmentNo: 2,
          status: "pending",
        },
      ],
      payments: [
        payment({
          id: "pay-1",
          paymentDate: "2026-12-05",
          amount: 0,
          scheduleId: "principal-placeholder-1",
        }),
      ],
    });

    const paymentRows = rows.filter((r) => r.scheduleId === "principal-placeholder-1");
    assert.equal(paymentRows.length, 1);
    assert.equal(paymentRows[0]?.kind, "payment");
  });

  it("never hides a row with a nonzero penalty or discount, even if target is $0", () => {
    const withPenalty = buildAccountLedgerRows({
      openingDebit: 100,
      schedules: [
        { id: "s1", dueDate: "2026-12-10", target: 0, penalty: 50, installmentNo: 1, status: "overdue" },
      ],
      payments: [],
    });
    assert.equal(withPenalty.filter((r) => r.kind === "installment").length, 1);

    const withDiscount = buildAccountLedgerRows({
      openingDebit: 100,
      schedules: [
        { id: "s2", dueDate: "2026-12-10", target: 0, penalty: 0, discount: 10, installmentNo: 1, status: "pending" },
      ],
      payments: [],
    });
    assert.equal(withDiscount.filter((r) => r.kind === "installment").length, 1);
  });

  it("hiding the placeholder row never changes the running balance shown on other rows", () => {
    const withPlaceholder = buildAccountLedgerRows({
      openingDebit: 120_000,
      schedules: [
        { id: "interest-1", dueDate: "2026-12-10", target: 2_500, penalty: 0, installmentNo: 1, status: "pending" },
        { id: "principal-placeholder-1", dueDate: "2026-12-10", target: 0, penalty: 0, installmentNo: 2, status: "pending" },
      ],
      payments: [
        payment({ id: "pay-1", paymentDate: "2026-12-10", amount: 2_500, scheduleId: "interest-1" }),
      ],
    });
    const withoutPlaceholder = buildAccountLedgerRows({
      openingDebit: 120_000,
      schedules: [
        { id: "interest-1", dueDate: "2026-12-10", target: 2_500, penalty: 0, installmentNo: 1, status: "pending" },
      ],
      payments: [
        payment({ id: "pay-1", paymentDate: "2026-12-10", amount: 2_500, scheduleId: "interest-1" }),
      ],
    });
    const balanceOf = (rows: ReturnType<typeof buildAccountLedgerRows>) =>
      rows.find((r) => r.kind === "totals")?.balance;
    assert.equal(balanceOf(withPlaceholder), balanceOf(withoutPlaceholder));
    assert.equal(balanceOf(withPlaceholder), 117_500);
  });
});

describe("mapScheduleRowForLedger (2026-08-31 — the one shared DB-row-to-ledger-row mapper)", () => {
  it("maps every ledger-relevant field, including discount_amount", () => {
    const row = mapScheduleRowForLedger(
      {
        id: "abc-123",
        installment_no: 3,
        due_date: "2026-09-30",
        amount_due: "33224.40",
        penalty_amount: "50.00",
        discount_amount: "1544.40",
        status: "pending",
      },
      "605226",
    );

    assert.deepEqual(row, {
      id: "abc-123",
      dueDate: "2026-09-30",
      target: 33224.4,
      amountPaid: 0,
      penalty: 50,
      discount: 1544.4,
      // Collector Discount fields (feature-collector-discount-implementation-plan.md,
      // Phase 6) — null/0 on a row that predates or never received one.
      discountSource: null,
      penaltyDiscount: 0,
      // Penalty breakdown Phase 5b — 0/null on a row nothing rolled into.
      carriedInterest: 0,
      carriedPenalty: 0,
      carriedFromInstallmentNo: null,
      installmentNo: 3,
      checkNo: "605226",
      status: "pending",
      // Move of Payment fields (Phase 6 / Fixes Plan Phase 4b) — null on a
      // row that was never moved.
      movedAt: null,
      moveSurchargeAmount: null,
      moveOfPaymentBatchId: null,
      deferredFromMoveOfPaymentBatchId: null,
    });
  });

  it("treats a missing/null discount_amount as 0, not NaN", () => {
    const row = mapScheduleRowForLedger({
      id: "s1",
      installment_no: 1,
      due_date: "2026-08-31",
      amount_due: 33224.4,
      penalty_amount: 0,
      status: "pending",
    });
    assert.equal(row.discount, 0);
  });

  it("checkNo defaults to null when not supplied", () => {
    const row = mapScheduleRowForLedger({
      id: "s1",
      installment_no: 1,
      due_date: "2026-08-31",
      amount_due: 100,
    });
    assert.equal(row.checkNo, null);
  });
});

describe("AMORTIZATION_SCHEDULE_LEDGER_COLUMNS (2026-08-31)", () => {
  it("includes discount_amount — the exact column that went missing from 2 of 4 routes", () => {
    assert.ok(AMORTIZATION_SCHEDULE_LEDGER_COLUMNS.includes("discount_amount"));
  });

  it("includes every field mapScheduleRowForLedger reads", () => {
    for (const column of [
      "id",
      "installment_no",
      "due_date",
      "amount_due",
      "penalty_amount",
      "discount_amount",
      "status",
      "move_of_payment_batch_id",
      "deferred_from_move_of_payment_batch_id",
    ]) {
      assert.ok(
        AMORTIZATION_SCHEDULE_LEDGER_COLUMNS.includes(column),
        `missing column: ${column}`,
      );
    }
  });
});

/**
 * Regression coverage for Phase 6 (see
 * docs/revision-plans/feature-move-of-payment-implementation-plan.md) — a
 * moved batch (1 row normally, 2 for Quarterly/Two-Monthly's
 * interest+principal split) must always render as exactly one ledger row,
 * never one per underlying database row, and must never hide a real
 * payment already posted before the row was moved.
 */
describe("buildAccountLedgerRows — Move of Payment", () => {
  it("renders a size-1 moved batch as one row with target null and debit=credit=surcharge", () => {
    const rows = buildAccountLedgerRows({
      openingDebit: 2000,
      schedules: [
        {
          id: "s1",
          dueDate: "2026-09-30",
          target: 1000,
          penalty: 0,
          installmentNo: 1,
          status: "moved",
          movedAt: "2026-09-01T00:00:00Z",
          moveSurchargeAmount: 150.5,
          moveOfPaymentBatchId: "batch-1",
        },
      ],
      payments: [],
    });

    const moveRow = rows.find((r) => r.kind === "move_of_payment");
    assert.ok(moveRow, "expected a move_of_payment row");
    assert.equal(moveRow?.target, null);
    assert.equal(moveRow?.debit, 150.5);
    assert.equal(moveRow?.credit, 150.5);
    assert.equal(moveRow?.status, "moved");
    assert.equal(moveRow?.dueDate, "2026-09-30");
    // Balance is untouched — the surcharge nets to zero, it never reduces
    // what's owed (requirements §2.3).
    assert.equal(moveRow?.balance, 2000);

    // No separate "installment" row for this schedule id.
    assert.equal(
      rows.some((r) => r.kind === "installment" && r.scheduleId === "s1"),
      false,
    );
  });

  it("renders a size-2 batch (Quarterly interest+principal) as exactly one row", () => {
    const rows = buildAccountLedgerRows({
      openingDebit: 5000,
      schedules: [
        {
          id: "s1",
          dueDate: "2026-11-30",
          target: 500,
          penalty: 0,
          installmentNo: 1,
          status: "moved",
          movedAt: "2026-09-01T00:00:00Z",
          moveSurchargeAmount: 300,
          moveOfPaymentBatchId: "batch-quarterly",
        },
        {
          id: "s2",
          dueDate: "2026-11-30",
          target: 4500,
          penalty: 0,
          installmentNo: 2,
          status: "moved",
          movedAt: "2026-09-01T00:00:00Z",
          moveSurchargeAmount: 0,
          moveOfPaymentBatchId: "batch-quarterly",
        },
      ],
      payments: [],
    });

    const moveRows = rows.filter((r) => r.kind === "move_of_payment");
    assert.equal(moveRows.length, 1, "expected exactly one row for the whole batch");
    assert.equal(moveRows[0]?.debit, 300);
    assert.equal(moveRows[0]?.credit, 300);
  });

  it("still shows a real payment posted before the row was later moved", () => {
    const rows = buildAccountLedgerRows({
      openingDebit: 1000,
      schedules: [
        {
          id: "s1",
          dueDate: "2026-09-30",
          target: 1000,
          penalty: 0,
          installmentNo: 1,
          status: "moved",
          movedAt: "2026-09-15T00:00:00Z",
          moveSurchargeAmount: 90,
          moveOfPaymentBatchId: "batch-2",
        },
      ],
      payments: [
        payment({ id: "p1", paymentDate: "2026-09-05", amount: 400, scheduleId: "s1", status: "posted" }),
      ],
    });

    const paymentRow = rows.find((r) => r.kind === "payment" && r.scheduleId === "s1");
    assert.ok(paymentRow, "the prior real payment must still appear");
    assert.equal(paymentRow?.credit, 400);

    const moveRow = rows.find((r) => r.kind === "move_of_payment");
    assert.ok(moveRow, "the batch summary row must still appear alongside it");
  });

  // Fixes Plan Phase 4 (Issue 4) — a collected surcharge renders as its own
  // line that does NOT net against the loan balance or the credit total.
  it("renders a collected surcharge as a surcharge_payment row that doesn't change balance/totals", () => {
    const rows = buildAccountLedgerRows({
      openingDebit: 2000,
      schedules: [
        {
          id: "s1",
          dueDate: "2026-09-30",
          target: 1000,
          penalty: 0,
          installmentNo: 1,
          status: "moved",
          movedAt: "2026-09-01T00:00:00Z",
          moveSurchargeAmount: 150.5,
          moveOfPaymentBatchId: "batch-1",
        },
      ],
      payments: [
        payment({
          id: "sur-1",
          paymentDate: "2026-09-05",
          amount: 150.5,
          status: "posted",
          referenceNo: "DEP-9",
          moveOfPaymentBatchId: "batch-1",
        }),
      ],
    });

    const surRow = rows.find((r) => r.kind === "surcharge_payment");
    assert.ok(surRow, "expected a surcharge_payment row");
    assert.equal(surRow?.credit, 150.5);
    assert.equal(surRow?.debit, null);
    assert.equal(surRow?.balance, 2000, "surcharge must not reduce the balance");
    assert.equal(surRow?.referenceNo, "DEP-9");

    // The marker row loses its amounts once a real surcharge exists.
    const moveRow = rows.find((r) => r.kind === "move_of_payment");
    assert.ok(moveRow);
    assert.equal(moveRow?.debit, null);
    assert.equal(moveRow?.credit, null);
    assert.equal(moveRow?.status, "moved");

    // Report Total: opening debit unchanged, credit total is 0 (the
    // surcharge is excluded), balance unchanged.
    const totals = rows.find((r) => r.kind === "totals");
    assert.equal(totals?.debit, 2000);
    assert.equal(totals?.credit, 0);
    assert.equal(totals?.balance, 2000);
  });

  it("still shows a collected surcharge whose move has since reverted (no moved row left)", () => {
    const rows = buildAccountLedgerRows({
      openingDebit: 2000,
      schedules: [
        {
          id: "s1",
          dueDate: "2026-09-30",
          target: 1000,
          penalty: 0,
          installmentNo: 1,
          status: "overdue",
        },
      ],
      payments: [
        payment({
          id: "sur-1",
          paymentDate: "2026-09-05",
          amount: 150.5,
          status: "posted",
          moveOfPaymentBatchId: "batch-gone",
        }),
      ],
    });

    const surRow = rows.find((r) => r.kind === "surcharge_payment");
    assert.ok(surRow, "surcharge still shows even after the move reverted");
    assert.equal(surRow?.credit, 150.5);
    assert.equal(rows.find((r) => r.kind === "totals")?.credit, 0);
  });

  // Fixes Plan Phase 4b (Issue 7) — check markers on the moved / appended rows.
  it("shows the held check number on the moved row and 'replacement needed' on the appended row", () => {
    const rows = buildAccountLedgerRows({
      openingDebit: 3000,
      schedules: [
        {
          id: "s1",
          dueDate: "2026-09-30",
          target: 1000,
          penalty: 0,
          installmentNo: 1,
          status: "moved",
          movedAt: "2026-09-01T00:00:00Z",
          moveSurchargeAmount: 90,
          moveOfPaymentBatchId: "batch-1",
          checkNo: "667220 (held)", // supplied by checkNumbersByInstallmentNo
        },
        {
          id: "s7",
          dueDate: "2027-04-30",
          target: 1000,
          penalty: 0,
          installmentNo: 7,
          status: "pending",
          deferredFromMoveOfPaymentBatchId: "batch-1",
        },
      ],
      payments: [],
    });

    const moveRow = rows.find((r) => r.kind === "move_of_payment");
    assert.equal(moveRow?.checkNo, "667220 (held)");

    const extRow = rows.find(
      (r) => r.kind === "installment" && r.scheduleId === "s7",
    );
    assert.equal(extRow?.checkNo, "replacement needed");
  });

  it("shows the replacement check number on the appended row once one is on file", () => {
    const rows = buildAccountLedgerRows({
      openingDebit: 3000,
      schedules: [
        {
          id: "s7",
          dueDate: "2027-04-30",
          target: 1000,
          penalty: 0,
          installmentNo: 7,
          status: "pending",
          deferredFromMoveOfPaymentBatchId: "batch-1",
          checkNo: "999888", // positional map picked up the replacement
        },
      ],
      payments: [],
    });

    const extRow = rows.find(
      (r) => r.kind === "installment" && r.scheduleId === "s7",
    );
    assert.equal(extRow?.checkNo, "999888");
  });
});

describe("checkNumbersByInstallmentNo", () => {
  // 4 real (non-$0) rows, installment_no 1-4 — the shape every schedule
  // except Quarterly/Two-Monthly Special has always had, where check count
  // equals schedule row count 1:1.
  const fourRealRows = [
    { installment_no: 1, amount_due: 1000 },
    { installment_no: 2, amount_due: 1000 },
    { installment_no: 3, amount_due: 1000 },
    { installment_no: 4, amount_due: 1000 },
  ];

  it("maps sort_order 0 to installment 1", () => {
    const map = checkNumbersByInstallmentNo(
      [
        { sort_order: 0, check_number: "1351" },
        { sort_order: 1, check_number: "151" },
      ],
      fourRealRows,
    );

    assert.equal(map.get(1), "1351");
    assert.equal(map.get(2), "151");
    assert.equal(map.get(3), undefined);
  });

  it("skips checks with a blank or missing number", () => {
    const map = checkNumbersByInstallmentNo(
      [
        { sort_order: 0, check_number: "   " },
        { sort_order: 1, check_number: null },
        { sort_order: 2 },
        { sort_order: 3, check_number: " 777 " },
      ],
      fourRealRows,
    );

    assert.equal(map.size, 1);
    assert.equal(map.get(4), "777");
  });

  it("marks held and replaced checks (Fixes Plan Phase 4b)", () => {
    const map = checkNumbersByInstallmentNo(
      [
        { sort_order: 0, check_number: "111", status: "held" },
        { sort_order: 1, check_number: "222", status: "replaced" },
        { sort_order: 2, check_number: "333", status: "active" },
        { sort_order: 3, check_number: "444" }, // no status → active
      ],
      fourRealRows,
    );

    assert.equal(map.get(1), "111 (held)");
    assert.equal(map.get(2), "222 (replaced)");
    assert.equal(map.get(3), "333");
    assert.equal(map.get(4), "444");
  });

  /**
   * Regression for a live bug found via Committee → LRA → AR end-to-end
   * testing (2026-09-04, Quarterly Special, 9-month term / 3 quarters).
   * amortization_schedules has 6 rows (installment_no 1-6): interest,
   * principal($0), interest, principal($0), interest, principal(real, the
   * final one) — but only 4 real PDC checks exist (3 interest + 1 final
   * principal), since release-service.ts's buildExpectedPdcSchedule filters
   * amountDue > 0 before generating checks. The pre-fix "sort_order N ->
   * installment_no N+1" mapping put check 2 (the real Mar-due interest
   * check) on installment_no 2 (the $0 Dec-due principal placeholder), check
   * 3 on installment_no 3 (actually the real Mar-due interest row), and
   * check 4 (the real final principal check) on installment_no 4 (a $0
   * placeholder) — every check after the first landed one row early, and the
   * real final principal row (installment_no 6) never got a check at all.
   */
  it("Quarterly Special: skips $0 placeholder rows so real checks land on the real rows, not shifted by one", () => {
    const quarterlySpecialSchedule = [
      { installment_no: 1, amount_due: 15_658.5 }, // interest, Q1 (Dec)
      { installment_no: 2, amount_due: 0 }, // principal placeholder, Q1
      { installment_no: 3, amount_due: 15_658.5 }, // interest, Q2 (Mar)
      { installment_no: 4, amount_due: 0 }, // principal placeholder, Q2
      { installment_no: 5, amount_due: 15_658.5 }, // interest, Q3 (Jun)
      { installment_no: 6, amount_due: 160_600 }, // final principal, Q3 (Jun) — real
    ];
    const checks = [
      { sort_order: 0, check_number: "607852" }, // Q1 interest
      { sort_order: 1, check_number: "972365" }, // Q2 interest
      { sort_order: 2, check_number: "491237" }, // Q3 interest
      { sort_order: 3, check_number: "638228" }, // final principal
    ];

    const map = checkNumbersByInstallmentNo(checks, quarterlySpecialSchedule);

    // Pre-fix (naive sort_order+1) mapping would have produced
    // {1: "607852", 2: "972365", 3: "491237", 4: "638228"}, with 5 and 6
    // undefined — every check from the 2nd one on landed one real row too
    // early, and the real final-principal row never got a check at all.
    assert.equal(map.get(1), "607852"); // Q1 interest — correct either way
    assert.equal(map.get(2), undefined); // $0 placeholder never gets a check
    assert.equal(map.get(3), "972365"); // Q2 interest — pre-fix this was "491237" (wrong)
    assert.equal(map.get(4), undefined); // $0 placeholder never gets a check
    assert.equal(map.get(5), "491237"); // Q3 interest — pre-fix this was undefined (never assigned)
    assert.equal(map.get(6), "638228"); // final principal — pre-fix this was undefined (never assigned)
  });
});

describe("buildAccountLedgerRows — per-month remaining columns (This month / Penalty left, 2026-09-09)", () => {
  const p = (
    over: Partial<LedgerPaymentEntry> &
      Pick<LedgerPaymentEntry, "id" | "paymentDate" | "amount">,
  ): LedgerPaymentEntry => ({
    referenceNo: null,
    channel: "bank_deposit",
    status: "posted",
    scheduleId: null,
    penaltyPortion: 0,
    ...over,
  });

  it("an unpaid installment shows its full principal and full penalty as still owed", () => {
    const rows = buildAccountLedgerRows({
      openingDebit: 5000,
      schedules: [
        { id: "s1", dueDate: "2026-02-15", target: 1000, penalty: 0, installmentNo: 1, status: "pending" },
        { id: "s2", dueDate: "2026-03-15", target: 1000, penalty: 50, installmentNo: 2, status: "overdue" },
      ],
      payments: [],
    });
    const insts = rows.filter((r) => r.kind === "installment");
    assert.equal(insts[0]?.monthRemaining, 1000);
    assert.equal(insts[0]?.penaltyRemaining, 0);
    assert.equal(insts[1]?.monthRemaining, 1000);
    assert.equal(insts[1]?.penaltyRemaining, 50);
  });

  it("a credit splits into principal and penalty portions", () => {
    const rows = buildAccountLedgerRows({
      openingDebit: 2000,
      schedules: [
        { id: "s1", dueDate: "2026-02-15", target: 1000, penalty: 0, installmentNo: 1, status: "paid", amountPaid: 1000 },
        { id: "s2", dueDate: "2026-03-15", target: 1000, penalty: 50, installmentNo: 2, status: "partial", amountPaid: 250 },
      ],
      payments: [
        p({ id: "c1", paymentDate: "2026-02-16", amount: 1000, scheduleId: "s1" }),
        p({ id: "c2", paymentDate: "2026-03-20", amount: 250, scheduleId: "s2", penaltyPortion: 50 }),
      ],
    });
    const paid = rows.filter((r) => r.kind === "payment");
    assert.equal(paid[0]?.monthRemaining, 0);
    assert.equal(paid[0]?.penaltyRemaining, 0);
    // ₱250 paid on s2, ₱50 of it late-fee -> penalty cleared, principal 1000-200=800
    assert.equal(paid[1]?.monthRemaining, 800);
    assert.equal(paid[1]?.penaltyRemaining, 0);
  });

  it("a credit with no penalty portion is all principal — penalty stays owed", () => {
    const rows = buildAccountLedgerRows({
      openingDebit: 1000,
      schedules: [
        { id: "s2", dueDate: "2026-03-15", target: 1000, penalty: 50, installmentNo: 2, status: "partial", amountPaid: 200 },
      ],
      payments: [p({ id: "c1", paymentDate: "2026-03-20", amount: 200, scheduleId: "s2", penaltyPortion: 0 })],
    });
    const row = rows.find((r) => r.kind === "payment");
    assert.equal(row?.monthRemaining, 800);
    assert.equal(row?.penaltyRemaining, 50);
  });

  it("principal-first (skip-fee): full monthly paid, ₱0 to the fee -> This month 0, Penalty left = charged", () => {
    const rows = buildAccountLedgerRows({
      openingDebit: 181_866.66,
      schedules: [
        { id: "n1", dueDate: "2026-04-06", target: 90_933.33, penalty: 25_123.21, installmentNo: 1, status: "partial", amountPaid: 90_933.33 },
        { id: "n2", dueDate: "2026-05-07", target: 90_933.33, penalty: 0, installmentNo: 2, status: "pending", amountPaid: 0 },
      ],
      payments: [
        p({ id: "c1", paymentDate: "2026-09-12", amount: 90_933.33, scheduleId: "n1", penaltyPortion: 0 }),
      ],
    });
    const paid = rows.find((r) => r.kind === "payment");
    assert.equal(paid?.monthRemaining, 0); // principal fully covered
    assert.equal(paid?.penaltyRemaining, 25_123.21); // fee untouched, still owed
    const totals = rows.at(-1);
    assert.equal(totals?.monthRemaining, 90_933.33);
    assert.equal(totals?.penaltyRemaining, 25_123.21);
    assert.ok(
      Math.abs(
        (totals?.monthRemaining ?? 0) +
          (totals?.penaltyRemaining ?? 0) -
          (totals?.balance ?? 0),
      ) < 0.005,
    );
  });

  it("totals: This month + Penalty left add up to the whole-loan Balance (plain loan)", () => {
    const rows = buildAccountLedgerRows({
      openingDebit: 374_000,
      schedules: [
        { id: "n1", dueDate: "2026-07-08", target: 74_800, penalty: 3_740, installmentNo: 1, status: "paid", amountPaid: 78_540 },
        { id: "n2", dueDate: "2026-08-08", target: 74_800, penalty: 3_740, installmentNo: 2, status: "partial", amountPaid: 50_000 },
        { id: "n3", dueDate: "2026-09-08", target: 74_800, penalty: 3_740, installmentNo: 3, status: "overdue", amountPaid: 0 },
        { id: "n4", dueDate: "2026-10-08", target: 74_800, penalty: 0, installmentNo: 4, status: "pending", amountPaid: 0 },
        { id: "n5", dueDate: "2026-11-08", target: 74_800, penalty: 0, installmentNo: 5, status: "pending", amountPaid: 0 },
      ],
      payments: [
        p({ id: "c1", paymentDate: "2026-07-05", amount: 78_540, scheduleId: "n1", penaltyPortion: 3_740 }),
        p({ id: "c2", paymentDate: "2026-09-02", amount: 50_000, scheduleId: "n2", penaltyPortion: 0 }),
      ],
    });
    const totals = rows.at(-1);
    assert.equal(totals?.kind, "totals");
    assert.equal(totals?.monthRemaining, 249_200); // 0 + 24_800 + 74_800 + 74_800 + 74_800
    assert.equal(totals?.penaltyRemaining, 7_480); // 0 + 3_740 + 3_740
    assert.equal(
      (totals?.monthRemaining ?? 0) + (totals?.penaltyRemaining ?? 0),
      totals?.balance,
    );
  });

  it("opening, move-of-payment and surcharge rows carry no per-month remaining", () => {
    const rows = buildAccountLedgerRows({
      openingDebit: 2000,
      schedules: [
        {
          id: "s1",
          dueDate: "2026-02-15",
          target: 1000,
          penalty: 0,
          installmentNo: 1,
          status: "moved",
          movedAt: "2026-02-20T00:00:00Z",
          moveSurchargeAmount: 150.5,
          moveOfPaymentBatchId: "batch-1",
        },
      ],
      payments: [],
    });
    const opening = rows.find((r) => r.kind === "opening");
    const moveRow = rows.find((r) => r.kind === "move_of_payment");
    assert.equal(opening?.monthRemaining, null);
    assert.equal(opening?.penaltyRemaining, null);
    assert.equal(moveRow?.monthRemaining, null);
    assert.equal(moveRow?.penaltyRemaining, null);
  });
});
