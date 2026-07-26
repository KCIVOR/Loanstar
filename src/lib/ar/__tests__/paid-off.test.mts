import test from "node:test";
import assert from "node:assert/strict";

import { canMarkPaidOff } from "../paid-off";

test("canMarkPaidOff allows loan_active with zero balance and all paid", () => {
  const result = canMarkPaidOff({
    applicationStatus: "loan_active",
    outstandingBalance: 0,
    scheduleStatuses: ["paid", "paid", "paid"],
  });
  assert.deepEqual(result, { ok: true });
});

test("canMarkPaidOff rejects when application is not loan_active", () => {
  const result = canMarkPaidOff({
    applicationStatus: "closed",
    outstandingBalance: 0,
    scheduleStatuses: ["paid"],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /loan active/i);
  }
});

test("canMarkPaidOff rejects when already paid_off", () => {
  const result = canMarkPaidOff({
    applicationStatus: "paid_off",
    outstandingBalance: 0,
    scheduleStatuses: ["paid"],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /already/i);
  }
});

test("canMarkPaidOff rejects when outstanding balance is positive", () => {
  const result = canMarkPaidOff({
    applicationStatus: "loan_active",
    outstandingBalance: 100,
    scheduleStatuses: ["paid"],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /balance/i);
  }
});

test("canMarkPaidOff rejects when any installment is not paid", () => {
  const result = canMarkPaidOff({
    applicationStatus: "loan_active",
    outstandingBalance: 0,
    scheduleStatuses: ["paid", "pending"],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /installment/i);
  }
});

test("canMarkPaidOff treats 'rolled' installments as settled, not blocking", () => {
  const result = canMarkPaidOff({
    applicationStatus: "loan_active",
    outstandingBalance: 0,
    scheduleStatuses: ["rolled", "rolled", "paid"],
  });
  assert.deepEqual(result, { ok: true });
});

test("canMarkPaidOff still rejects a genuinely unpaid installment alongside a rolled one", () => {
  const result = canMarkPaidOff({
    applicationStatus: "loan_active",
    outstandingBalance: 0,
    scheduleStatuses: ["rolled", "overdue"],
  });
  assert.equal(result.ok, false);
});

test("canMarkPaidOff allows zero balance with empty schedule list", () => {
  const result = canMarkPaidOff({
    applicationStatus: "loan_active",
    outstandingBalance: 0,
    scheduleStatuses: [],
  });
  assert.deepEqual(result, { ok: true });
});
