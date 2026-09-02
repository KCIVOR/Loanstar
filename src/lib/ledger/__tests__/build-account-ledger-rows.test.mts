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
    assert.equal(rows.at(-1)?.debit, 5000);
    assert.equal(rows.at(-1)?.credit, 0);
    assert.equal(rows.at(-1)?.balance, 5000);
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
    // Balance carries forward untouched while nothing is collected.
    assert.equal(installments[0]?.balance, 5000);
    assert.equal(installments[1]?.checkNo, "151");
    assert.equal(installments[1]?.penalty, 50);
    assert.equal(installments[1]?.balance, 5000);
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
    assert.equal(credits[1]?.balance, 3000);
    assert.equal(credits[1]?.dueDate, "2026-03-15");
    assert.equal(credits[1]?.target, 1000);
    assert.equal(credits[1]?.penalty, 50);
    assert.equal(rows.at(-1)?.credit, 2000);
    assert.equal(rows.at(-1)?.balance, 3000);
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
      penalty: 50,
      discount: 1544.4,
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
  it("maps sort_order 0 to installment 1", () => {
    const map = checkNumbersByInstallmentNo([
      { sort_order: 0, check_number: "1351" },
      { sort_order: 1, check_number: "151" },
    ]);

    assert.equal(map.get(1), "1351");
    assert.equal(map.get(2), "151");
    assert.equal(map.get(3), undefined);
  });

  it("skips checks with a blank or missing number", () => {
    const map = checkNumbersByInstallmentNo([
      { sort_order: 0, check_number: "   " },
      { sort_order: 1, check_number: null },
      { sort_order: 2 },
      { sort_order: 3, check_number: " 777 " },
    ]);

    assert.equal(map.size, 1);
    assert.equal(map.get(4), "777");
  });

  it("marks held and replaced checks (Fixes Plan Phase 4b)", () => {
    const map = checkNumbersByInstallmentNo([
      { sort_order: 0, check_number: "111", status: "held" },
      { sort_order: 1, check_number: "222", status: "replaced" },
      { sort_order: 2, check_number: "333", status: "active" },
      { sort_order: 3, check_number: "444" }, // no status → active
    ]);

    assert.equal(map.get(1), "111 (held)");
    assert.equal(map.get(2), "222 (replaced)");
    assert.equal(map.get(3), "333");
    assert.equal(map.get(4), "444");
  });
});
