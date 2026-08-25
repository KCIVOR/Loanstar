import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDeductionBreakdownRows,
  extractDeductionTargets,
  findCrossBucketAccountNos,
  findDuplicateAccountNos,
} from "../deduction-breakdown";

test("null/undefined input returns no rows", () => {
  assert.deepEqual(buildDeductionBreakdownRows(null), []);
  assert.deepEqual(buildDeductionBreakdownRows(undefined), []);
});

test("empty deductions object returns no rows", () => {
  assert.deepEqual(buildDeductionBreakdownRows({}), []);
});

test("legacy scalar fields produce one row each", () => {
  const rows = buildDeductionBreakdownRows({
    otherLoan: 5_000,
    otherLoanAccountNo: "AN1",
    offset: 3_000,
    offsetAccountNo: "AN2",
    offsetMonths: 2,
  });
  assert.deepEqual(rows, [
    { label: "Other Loan (AN1)", amount: 5_000 },
    { label: "Offset (AN2 · 2 mos)", amount: 3_000 },
  ]);
});

test("legacy scalar without an account number falls back to a plain label", () => {
  const rows = buildDeductionBreakdownRows({ otherLoan: 5_000, offset: 3_000 });
  assert.deepEqual(rows, [
    { label: "Other Loan", amount: 5_000 },
    { label: "Offset", amount: 3_000 },
  ]);
});

test("multi-entry arrays produce one row per entry", () => {
  const rows = buildDeductionBreakdownRows({
    otherLoans: [
      { accountNo: "AN1", amount: 5_000 },
      { accountNo: "AN2", amount: 3_000 },
    ],
    offsets: [
      { accountNo: "AN3", amount: 4_250.4, months: 1 },
      { accountNo: "AN4", amount: 8_500.8, months: 2 },
    ],
  });
  assert.deepEqual(rows, [
    { label: "Other Loan (AN1)", amount: 5_000 },
    { label: "Other Loan (AN2)", amount: 3_000 },
    { label: "Offset (AN3 · 1 mo)", amount: 4_250.4 },
    { label: "Offset (AN4 · 2 mos)", amount: 8_500.8 },
  ]);
});

test("array wins over legacy scalar when both are present", () => {
  const rows = buildDeductionBreakdownRows({
    otherLoan: 999_999,
    otherLoans: [{ accountNo: "AN1", amount: 5_000 }],
    offset: 999_999,
    offsets: [{ accountNo: "AN2", amount: 3_000, months: 1 }],
  });
  assert.deepEqual(rows, [
    { label: "Other Loan (AN1)", amount: 5_000 },
    { label: "Offset (AN2 · 1 mo)", amount: 3_000 },
  ]);
});

test("zero-amount entries are skipped", () => {
  const rows = buildDeductionBreakdownRows({
    otherLoans: [{ accountNo: "AN1", amount: 0 }],
    offsets: [{ accountNo: "AN2", amount: 0, months: 1 }],
  });
  assert.deepEqual(rows, []);
});

test("extractDeductionTargets: skips entries with no account number", () => {
  const targets = extractDeductionTargets({
    otherLoans: [{ accountNo: null, amount: 5_000 }],
    offsets: [{ accountNo: null, amount: 3_000, months: 1 }],
  });
  assert.deepEqual(targets, []);
});

test("extractDeductionTargets: multi-entry arrays produce one target per entry", () => {
  const targets = extractDeductionTargets({
    otherLoans: [{ accountNo: "AN1", amount: 5_000 }],
    offsets: [{ accountNo: "AN2", amount: 32_252, months: 2 }],
  });
  assert.deepEqual(targets, [
    { accountNo: "AN1", amount: 5_000, transferType: "other_loan", months: null },
    { accountNo: "AN2", amount: 32_252, transferType: "offset", months: 2 },
  ]);
});

test("extractDeductionTargets: legacy scalar with account number still produces a target", () => {
  const targets = extractDeductionTargets({
    offset: 32_252,
    offsetAccountNo: "AN2",
    offsetMonths: 2,
  });
  assert.deepEqual(targets, [
    { accountNo: "AN2", amount: 32_252, transferType: "offset", months: 2 },
  ]);
});

test("extractDeductionTargets: null/undefined input returns no targets", () => {
  assert.deepEqual(extractDeductionTargets(null), []);
  assert.deepEqual(extractDeductionTargets(undefined), []);
});

test("advancePayment/previousLoanBalance/accountOpening render as plain rows when non-zero", () => {
  const rows = buildDeductionBreakdownRows({
    advancePayment: 1_000,
    previousLoanBalance: 2_000,
    accountOpening: 500,
  });
  assert.deepEqual(rows, [
    { label: "Advance Payment", amount: 1_000 },
    { label: "Previous Loan Balance", amount: 2_000 },
    { label: "Account Opening", amount: 500 },
  ]);
});

test("findDuplicateAccountNos: undefined input returns no duplicates", () => {
  assert.deepEqual(findDuplicateAccountNos(undefined), []);
});

test("findDuplicateAccountNos: all-unique accounts return no duplicates", () => {
  assert.deepEqual(
    findDuplicateAccountNos([{ accountNo: "AN1" }, { accountNo: "AN2" }]),
    [],
  );
});

test("findDuplicateAccountNos: a repeated account is reported once", () => {
  assert.deepEqual(
    findDuplicateAccountNos([
      { accountNo: "AN1" },
      { accountNo: "AN1" },
      { accountNo: "AN1" },
    ]),
    ["AN1"],
  );
});

test("findDuplicateAccountNos: null accounts never collide with each other", () => {
  assert.deepEqual(
    findDuplicateAccountNos([{ accountNo: null }, { accountNo: null }]),
    [],
  );
});

test("findDuplicateAccountNos: a duplicate alongside unrelated unique entries", () => {
  assert.deepEqual(
    findDuplicateAccountNos([
      { accountNo: "AN1" },
      { accountNo: "AN2" },
      { accountNo: "AN1" },
      { accountNo: null },
    ]),
    ["AN1"],
  );
});

test("findCrossBucketAccountNos: no overlap returns nothing", () => {
  assert.deepEqual(
    findCrossBucketAccountNos([{ accountNo: "AN1" }], [{ accountNo: "AN2" }]),
    [],
  );
});

test("findCrossBucketAccountNos: same account in both buckets is reported", () => {
  assert.deepEqual(
    findCrossBucketAccountNos([{ accountNo: "AN1" }], [{ accountNo: "AN1" }]),
    ["AN1"],
  );
});

test("findCrossBucketAccountNos: a within-bucket repeat alone is not cross-bucket", () => {
  assert.deepEqual(
    findCrossBucketAccountNos(
      [{ accountNo: "AN1" }, { accountNo: "AN1" }],
      [{ accountNo: "AN2" }],
    ),
    [],
  );
});

test("findCrossBucketAccountNos: null accounts never collide", () => {
  assert.deepEqual(
    findCrossBucketAccountNos([{ accountNo: null }], [{ accountNo: null }]),
    [],
  );
});

test("findCrossBucketAccountNos: undefined buckets are treated as empty", () => {
  assert.deepEqual(findCrossBucketAccountNos(undefined, undefined), []);
  assert.deepEqual(findCrossBucketAccountNos([{ accountNo: "AN1" }], undefined), []);
});
