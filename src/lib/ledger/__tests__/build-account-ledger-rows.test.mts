import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildAccountLedgerRows,
  checkNumbersByInstallmentNo,
  ledgerEntriesFromPostings,
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
    });
    assert.equal(entries[1]?.scheduleId, null);
    assert.equal(entries[1]?.channel, "payment");
    assert.equal(entries[1]?.status, "posted");
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
});
