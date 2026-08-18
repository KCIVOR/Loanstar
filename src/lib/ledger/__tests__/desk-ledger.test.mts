import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildDeskLedgerRows } from "../desk-ledger";

const schedules = [
  {
    id: "s1",
    installmentNo: 1,
    dueDate: "2026-10-10",
    amountDue: 14122.95,
    penaltyAmount: 0,
    status: "paid",
  },
  {
    id: "s2",
    installmentNo: 2,
    dueDate: "2026-11-10",
    amountDue: 14122.95,
    penaltyAmount: 0,
    status: "pending",
  },
];

describe("buildDeskLedgerRows", () => {
  it("matches posted credits to the installment they settled", () => {
    const rows = buildDeskLedgerRows({
      totalLoan: 28245.9,
      schedules,
      postings: [
        {
          id: "post-1",
          amount: 14122.95,
          amortization_schedule_id: "s1",
          payments: {
            payment_date: "2026-10-10",
            reference_no: "1235151",
            channel: "bank_deposit",
            status: "posted",
          },
        },
      ],
      pdcChecks: [{ sort_order: 0, check_number: "1351" }],
    });

    const credit = rows.find((row) => row.kind === "payment");
    assert.ok(credit, "expected a credit row");
    assert.equal(credit.checkNo, "1351");
    assert.equal(credit.dueDate, "2026-10-10");
    assert.equal(credit.target, 14122.95);
    assert.equal(credit.status, "paid");
    assert.equal(credit.referenceNo, "1235151");
    assert.equal(credit.scheduleId, "s1");
  });

  it("keeps the settled installment from also rendering as an open row", () => {
    const rows = buildDeskLedgerRows({
      totalLoan: 28245.9,
      schedules,
      postings: [
        {
          id: "post-1",
          amount: 14122.95,
          amortization_schedule_id: "s1",
          payments: {
            payment_date: "2026-10-10",
            reference_no: "1235151",
            channel: "bank_deposit",
            status: "posted",
          },
        },
      ],
      pdcChecks: [],
    });

    const installmentRows = rows.filter((row) => row.kind === "installment");
    assert.deepEqual(
      installmentRows.map((row) => row.scheduleId),
      ["s2"],
    );
  });

  it("falls back to the schedule total when the loan total is missing", () => {
    const rows = buildDeskLedgerRows({
      totalLoan: 0,
      schedules,
      postings: [],
      pdcChecks: [],
    });

    assert.equal(rows[0]?.kind, "opening");
    assert.equal(rows[0]?.debit, 28245.9);
  });

  it("reports totals from posted credits only", () => {
    const rows = buildDeskLedgerRows({
      totalLoan: 28245.9,
      schedules,
      postings: [
        {
          id: "post-1",
          amount: 14122.95,
          amortization_schedule_id: "s1",
          payments: {
            payment_date: "2026-10-10",
            reference_no: "1235151",
            channel: "bank_deposit",
            status: "posted",
          },
        },
      ],
      pdcChecks: [],
    });

    const totals = rows.at(-1);
    assert.equal(totals?.kind, "totals");
    assert.equal(totals?.credit, 14122.95);
    assert.equal(totals?.balance, 14122.95);
  });
});
