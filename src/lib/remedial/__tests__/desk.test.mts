import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  remedialDaysPastDue,
  remedialSeverity,
  severityRank,
} from "../desk";

describe("remedialDaysPastDue", () => {
  it("uses earliest unpaid due date", () => {
    const dpd = remedialDaysPastDue(
      [
        {
          installment_no: 1,
          due_date: "2026-01-01",
          amount_due: 1000,
          status: "paid",
          penalty_amount: 0,
        },
        {
          installment_no: 2,
          due_date: "2026-04-01",
          amount_due: 1000,
          status: "overdue",
          penalty_amount: 0,
        },
      ],
      new Date("2026-07-10"),
    );
    assert.ok(dpd >= 90);
  });
});

describe("remedialSeverity", () => {
  it("flags critical for deep delinquency or large balance", () => {
    assert.equal(
      remedialSeverity({
        outstandingBalance: 120000,
        daysPastDue: 50,
        agingBucket: "61-90",
      }),
      "critical",
    );
    assert.equal(
      remedialSeverity({
        outstandingBalance: 10000,
        daysPastDue: 130,
        agingBucket: "91+",
      }),
      "critical",
    );
  });

  it("ranks critical ahead of watch", () => {
    assert.ok(severityRank("critical") < severityRank("watch"));
  });
});
