import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  agingNeedsAttention,
  dcrItemTotal,
  isActiveDcrStatus,
  nextOpenInstallment,
  paymentIdsLockedForCollectorDesk,
} from "../desk";

describe("agingNeedsAttention", () => {
  it("treats current as fine", () => {
    assert.equal(agingNeedsAttention("current"), false);
    assert.equal(agingNeedsAttention("Current"), false);
    assert.equal(agingNeedsAttention(""), false);
  });

  it("flags non-current aging", () => {
    assert.equal(agingNeedsAttention("1-30"), true);
    assert.equal(agingNeedsAttention("91+"), true);
  });
});

describe("nextOpenInstallment", () => {
  it("returns earliest unpaid by due date", () => {
    const next = nextOpenInstallment([
      {
        installment_no: 2,
        due_date: "2026-10-10",
        amount_due: 2000,
        status: "pending",
        penalty_amount: 0,
      },
      {
        installment_no: 1,
        due_date: "2026-09-10",
        amount_due: 1000,
        status: "pending",
        penalty_amount: 50,
      },
      {
        installment_no: 3,
        due_date: "2026-08-10",
        amount_due: 1000,
        status: "paid",
        penalty_amount: 0,
      },
    ]);
    assert.deepEqual(next, {
      installment_no: 1,
      due_date: "2026-09-10",
      amount_due: 1000,
      penalty_amount: 50,
      netAmountDue: 1050, // no discount on this fixture — same as gross + penalty
    });
  });

  it("netAmountDue subtracts an active discount (fixed 2026-08-31)", () => {
    const next = nextOpenInstallment([
      {
        installment_no: 1,
        due_date: "2026-09-10",
        amount_due: 1080,
        status: "pending",
        penalty_amount: 0,
        discount_amount: 1080, // 100% off
      },
    ]);
    assert.equal(next?.amount_due, 1080); // gross, unchanged for callers that need it
    assert.equal(next?.netAmountDue, 0); // real amount owed
  });

  it("returns null when all paid", () => {
    assert.equal(
      nextOpenInstallment([
        {
          installment_no: 1,
          due_date: "2026-09-10",
          amount_due: 1000,
          status: "paid",
          penalty_amount: 0,
        },
      ]),
      null,
    );
  });

  it("skips a $0 principal placeholder row (Quarterly/Two-Monthly Special) and returns the real interest row instead", () => {
    // Regression for a live bug (AN300445, 2026-09-04): Special-schedule
    // loans persist a $0 "principal" row on the same due date as every
    // non-final period's real interest row. If the interest row happened to
    // be paid early while its $0 sibling stayed pending, this used to
    // surface "next due: ₱0.00" to a collector/borrower.
    const next = nextOpenInstallment([
      {
        installment_no: 1,
        due_date: "2026-11-10",
        amount_due: 11781,
        status: "paid", // interest row already paid early
        penalty_amount: 0,
      },
      {
        installment_no: 2,
        due_date: "2026-11-10", // same due date, $0 principal placeholder
        amount_due: 0,
        status: "pending",
        penalty_amount: 0,
      },
      {
        installment_no: 3,
        due_date: "2027-01-10",
        amount_due: 11781,
        status: "pending",
        penalty_amount: 0,
      },
    ]);
    assert.equal(next?.installment_no, 3);
    assert.equal(next?.amount_due, 11781);
  });

  it("returns null when every open row is a $0 placeholder (no real payment left)", () => {
    assert.equal(
      nextOpenInstallment([
        {
          installment_no: 2,
          due_date: "2026-11-10",
          amount_due: 0,
          status: "pending",
          penalty_amount: 0,
        },
      ]),
      null,
    );
  });
});

describe("dcrItemTotal", () => {
  it("sums item amounts", () => {
    assert.equal(dcrItemTotal([{ amount: 100 }, { amount: 50.5 }]), 150.5);
    assert.equal(dcrItemTotal([]), 0);
  });
});

describe("isActiveDcrStatus", () => {
  it("locks draft, submitted, and reconciled", () => {
    assert.equal(isActiveDcrStatus("draft"), true);
    assert.equal(isActiveDcrStatus("submitted"), true);
    assert.equal(isActiveDcrStatus("reconciled"), true);
  });

  it("does not lock rejected", () => {
    assert.equal(isActiveDcrStatus("rejected"), false);
  });
});

describe("paymentIdsLockedForCollectorDesk", () => {
  it("locks payments on submitted/reconciled DCRs, keeps draft-only visible", () => {
    const locked = paymentIdsLockedForCollectorDesk([
      { payment_id: "p-draft", dcr_status: "draft" },
      { payment_id: "p-sub", dcr_status: "submitted" },
      { payment_id: "p-rec", dcr_status: "reconciled" },
      { payment_id: "p-rej", dcr_status: "rejected" },
    ]);
    assert.deepEqual([...locked].sort(), ["p-rec", "p-sub"]);
  });
});
