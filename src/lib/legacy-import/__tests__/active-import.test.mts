import assert from "node:assert/strict";
import test from "node:test";
import { buildActiveImport } from "../active-import";
import { suggestMapping } from "../suggest";

const headers = ["Legacy Loan No.", "First Name", "Last Name", "Email", "Loan Desired", "Terms", "Monthly Amort.", "Interest Rate", "Processing Fee Rate", "Principal Loan", "Total Loan Amount", "Total Interest", "Net Loan Amount", "Processing Fee", "Notary Fee", "Security Fee", "Admin Cost", "Documentary Stamp", "Total Deduction", "Outstanding Balance", "Balance As Of"];
const cells = ["TEST-IMPORT", "Test", "Borrower", "test@example.com", 1000, 2, 600, 0.2, 0.03, 1000, 1200, 200, 970, 30, 0, 0, 0, 0, 30, 850, "2026-10-07"];
const installmentHeaders = ["Legacy Loan No.", "Installment No.", "Due Date", "Amount Due", "Amount Paid", "Discount", "Penalty Charged", "Penalty Waived", "Penalty Paid", "Status", "Paid Date", "Line Type"];
function build(balance = 850, installments: unknown[][] = [
  ["TEST-IMPORT", 1, "2026-09-10", 600, 400, 0, 50, 0, 0, "partial", null, "standard"],
  ["TEST-IMPORT", 2, "2026-11-10", 600, 0, 0, 0, 0, 0, "pending", null, "standard"],
]) {
  const row = [...cells]; row[19] = balance;
  return buildActiveImport([{ rowNumber: 2, cells: row }], suggestMapping(headers, "seafarer"), "seafarer", [installmentHeaders, ...installments], "2026-10-07");
}
test("imports only unpaid balances while preserving actual due dates and fees", () => {
  const result = build();
  assert.deepEqual(result.errors, []);
  assert.equal(result.accounts[0].values.outstanding_balance, 850);
  assert.deepEqual(result.accounts[0].installments.map(s => [s.amount_due, s.penalty_amount, s.due_date]), [[200, 50, "2026-09-10"], [600, 0, "2026-11-10"]]);
});
test("blocks a mismatched opening balance", () => { assert.match(build(800).errors.join(" "), /balance/i); });
test("rejects duplicate installment numbers", () => {
  const row = ["TEST-IMPORT", 1, "2026-11-10", 850, 0, 0, 0, 0, 0, "pending", null, "standard"];
  assert.match(build(1700, [row, row]).errors.join(" "), /duplicate/i);
});
test("rejects paid status hiding an unpaid balance", () => {
  assert.match(build(850, [["TEST-IMPORT", 1, "2026-09-10", 850, 0, 0, 0, 0, 0, "paid", null, "standard"]]).errors.join(" "), /paid/i);
});
test("allows remaining balances above the original loan when verified fees explain it", () => {
  assert.deepEqual(build(1250, [["TEST-IMPORT", 1, "2026-09-10", 1200, 0, 0, 50, 0, 0, "pending", null, "standard"]]).errors, []);
});

test("rejects unknown installment statuses instead of silently treating them as unpaid", () => {
  assert.match(build(850, [["TEST-IMPORT", 1, "2026-09-10", 850, 0, 0, 0, 0, 0, "cancelled", null, "standard"]]).errors.join(" "), /status/i);
});

test("accepts blank optional status and line type cells", () => {
  assert.deepEqual(build(850, [["TEST-IMPORT", 1, "2026-09-10", 850, 0, 0, 0, 0, 0, "", null, ""]]).errors, []);
});

function paid(balance = 0, closed: unknown = "2026-09-10", lines: unknown[][] = [
  ["TEST-IMPORT", 1, "2026-09-10", 1200, 1200, 0, 0, 0, 0, "paid", "2026-09-10", "standard"],
]) {
  const row = [...cells, "paid", closed]; row[19] = balance;
  return buildActiveImport([{ rowNumber: 2, cells: row }], suggestMapping([...headers, "Account Status", "Closed At"], "seafarer"), "seafarer", [installmentHeaders, ...lines], "2026-10-07");
}
test("imports a fully paid account with zero balance and verified settled source installments", () => {
  const result = paid();
  assert.deepEqual(result.errors, []);
  assert.equal(result.accounts[0].values.account_status, "paid");
  assert.equal(result.accounts[0].values.closed_at, "2026-09-10");
  assert.deepEqual(result.accounts[0].installments, []);
});
test("rejects paid loans with a balance, missing or future closing date, or no settled source rows", () => {
  for (const result of [paid(1), paid(0, null), paid(0, "2026-11-01"), paid(0, "2026-09-10", [])]) assert.ok(result.errors.length);
});
test("rejects paid accounts with unpaid penalty balances", () => {
  assert.ok(paid(0, "2026-09-10", [["TEST-IMPORT", 1, "2026-09-10", 1200, 1200, 0, 50, 0, 0, "paid", null, "standard"]]).errors.length);
});
test("does not infer a paid loan just from an active loan's zero balance", () => {
  assert.ok(build(0, []).errors.length);
});
test("rejects a paid loan whose settled source installments omit part of the original loan", () => {
  assert.ok(paid(0, "2026-09-10", [["TEST-IMPORT", 1, "2026-09-10", 600, 600, 0, 0, 0, 0, "paid", "2026-09-10", "standard"]]).errors.length);
});
