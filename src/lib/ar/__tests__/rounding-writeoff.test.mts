import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canWriteOffAccountRounding } from "../rounding-writeoff";

describe("canWriteOffAccountRounding", () => {
  it("allows a leftover centavo when every installment is paid", () => {
    const result = canWriteOffAccountRounding({
      outstandingBalance: 0.01,
      threshold: 1,
      scheduleStatuses: ["paid", "paid", "paid"],
    });
    assert.deepEqual(result, { ok: true, amount: 0.01 });
  });

  it("treats rolled installments as settled", () => {
    const result = canWriteOffAccountRounding({
      outstandingBalance: 0.02,
      threshold: 1,
      scheduleStatuses: ["rolled", "paid"],
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.amount, 0.02);
  });

  it("rejects leftover above the threshold", () => {
    const result = canWriteOffAccountRounding({
      outstandingBalance: 1.01,
      threshold: 1,
      scheduleStatuses: ["paid"],
    });
    assert.equal(result.ok, false);
  });

  it("rejects when an installment is still open", () => {
    const result = canWriteOffAccountRounding({
      outstandingBalance: 0.01,
      threshold: 1,
      scheduleStatuses: ["paid", "pending"],
    });
    assert.equal(result.ok, false);
  });

  it("rejects a zero outstanding", () => {
    const result = canWriteOffAccountRounding({
      outstandingBalance: 0,
      threshold: 1,
      scheduleStatuses: ["paid"],
    });
    assert.equal(result.ok, false);
  });
});
