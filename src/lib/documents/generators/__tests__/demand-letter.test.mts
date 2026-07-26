import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDemandLetterContext,
  isDemandStage,
  type DemandLetterInput,
} from "../demand-letter";

const BASE: DemandLetterInput = {
  borrowerName: "Juan Dela Cruz",
  address: "123 Rizal St, Makati",
  loanAccountNo: "LA303342",
  outstandingBalance: 34856.4,
  penaltyAmount: 1742.82,
  daysPastDue: 45,
  dueDate: "05/26/2026",
  paymentDeadline: "07/26/2026",
  demandStage: "final_demand",
  todayDate: "07/11/2026",
};

test("total amount due = outstanding + penalty, formatted", () => {
  const ctx = buildDemandLetterContext(BASE);
  assert.equal(ctx.outstandingBalance, "34,856.40");
  assert.equal(ctx.penaltyAmount, "1,742.82");
  assert.equal(ctx.totalAmountDue, "36,599.22");
});

test("amount in words reflects the whole-peso total", () => {
  const ctx = buildDemandLetterContext(BASE);
  // 36,599 -> "Thirty Six Thousand Five Hundred Ninety Nine Pesos"
  assert.match(String(ctx.amountInWords), /Thirty Six Thousand.*Pesos$/);
});

test("final_demand sets isFinal + FINAL DEMAND label", () => {
  const ctx = buildDemandLetterContext(BASE);
  assert.equal(ctx.isFinal, true);
  assert.equal(ctx.demandStage, "FINAL DEMAND");
});

test("non-final stages do not reveal the legal-action clause", () => {
  const first = buildDemandLetterContext({ ...BASE, demandStage: "first_reminder" });
  assert.equal(first.isFinal, false);
  assert.equal(first.demandStage, "FIRST REMINDER");

  const second = buildDemandLetterContext({ ...BASE, demandStage: "second_demand" });
  assert.equal(second.isFinal, false);
  assert.equal(second.demandStage, "SECOND DEMAND");
});

test("isDemandStage guards the API input", () => {
  assert.ok(isDemandStage("first_reminder"));
  assert.ok(isDemandStage("second_demand"));
  assert.ok(isDemandStage("final_demand"));
  assert.equal(isDemandStage("nudge"), false);
  assert.equal(isDemandStage(""), false);
});

test("zero penalty still totals correctly", () => {
  const ctx = buildDemandLetterContext({ ...BASE, penaltyAmount: 0 });
  assert.equal(ctx.penaltyAmount, "0.00");
  assert.equal(ctx.totalAmountDue, "34,856.40");
});
