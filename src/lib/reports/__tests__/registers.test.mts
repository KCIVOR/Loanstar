import assert from "node:assert/strict";
import test from "node:test";

import {
  clampPage,
  filterLoanRegister,
  filterPastDue,
  groupLoansByBorrower,
  paginateRows,
  PAGE_SIZES,
  type LoanRegisterRow,
} from "../registers";

function loan(partial: Partial<LoanRegisterRow> & Pick<LoanRegisterRow, "masterlistId" | "borrowerId">): LoanRegisterRow {
  return {
    loanAccountNo: partial.loanAccountNo ?? "AN1",
    borrowerName: partial.borrowerName ?? "Ada",
    segment: partial.segment ?? "seafarer",
    accountStatus: partial.accountStatus ?? "active",
    agingBucket: partial.agingBucket ?? "current",
    outstanding: partial.outstanding ?? 100,
    totalLoan: partial.totalLoan ?? 1000,
    releaseDate: partial.releaseDate ?? "2026-01-01",
    collectorName: partial.collectorName ?? "Cole",
    remedialName: partial.remedialName ?? null,
    collateralType: "none",
    ...partial,
  };
}

test("groupLoansByBorrower sums two loans for the same borrower", () => {
  const rows = groupLoansByBorrower([
    loan({
      masterlistId: "a",
      borrowerId: "b1",
      borrowerName: "Ada",
      outstanding: 100,
      agingBucket: "1-30",
      segment: "seafarer",
    }),
    loan({
      masterlistId: "b",
      borrowerId: "b1",
      borrowerName: "Ada",
      outstanding: 50,
      agingBucket: "91+",
      segment: "sme",
    }),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.borrowerId, "b1");
  assert.equal(rows[0]?.loanCount, 2);
  assert.equal(rows[0]?.outstanding, 150);
  assert.equal(rows[0]?.worstAging, "91+");
  assert.equal(rows[0]?.segment, "mixed");
  assert.equal(rows[0]?.largestMasterlistId, "a");
});

test("worst aging prefers 91+ over current", () => {
  const rows = groupLoansByBorrower([
    loan({ masterlistId: "a", borrowerId: "b1", agingBucket: "current", outstanding: 10 }),
    loan({ masterlistId: "b", borrowerId: "b1", agingBucket: "31-60", outstanding: 1 }),
  ]);
  assert.equal(rows[0]?.worstAging, "31-60");
});

test("filterLoanRegister default unpaid excludes paid", () => {
  const rows = [
    loan({ masterlistId: "a", borrowerId: "1", accountStatus: "active" }),
    loan({ masterlistId: "b", borrowerId: "2", accountStatus: "remedial" }),
    loan({ masterlistId: "c", borrowerId: "3", accountStatus: "paid", outstanding: 0 }),
  ];
  const unpaid = filterLoanRegister(rows, {
    status: "unpaid",
    segment: "all",
    aging: "all",
    collateral: "all",
  });
  assert.deepEqual(
    unpaid.map((r) => r.masterlistId),
    ["a", "b"],
  );
});

test("filterLoanRegister aging and segment", () => {
  const rows = [
    loan({ masterlistId: "a", borrowerId: "1", segment: "seafarer", agingBucket: "91+" }),
    loan({ masterlistId: "b", borrowerId: "2", segment: "sme", agingBucket: "91+" }),
    loan({ masterlistId: "c", borrowerId: "3", segment: "seafarer", agingBucket: "current" }),
  ];
  const filtered = filterLoanRegister(rows, {
    status: "unpaid",
    segment: "seafarer",
    aging: "91+",
    collateral: "all",
  });
  assert.deepEqual(
    filtered.map((r) => r.masterlistId),
    ["a"],
  );
});

test("filterLoanRegister keeps Individual instead of dropping it to All", () => {
  const rows = [
    loan({ masterlistId: "a", borrowerId: "1", segment: "individual" }),
    loan({ masterlistId: "b", borrowerId: "2", segment: "seafarer" }),
  ];
  const filtered = filterLoanRegister(rows, {
    status: "unpaid",
    segment: "individual",
    aging: "all",
    collateral: "all",
  });
  assert.deepEqual(
    filtered.map((r) => r.masterlistId),
    ["a"],
  );
});

test("filterLoanRegister collateral=car_refinancing", () => {
  const rows = [
    loan({ masterlistId: "a", borrowerId: "1", collateralType: "none" }),
    loan({ masterlistId: "b", borrowerId: "2", collateralType: "car_refinancing" }),
    loan({ masterlistId: "c", borrowerId: "3", collateralType: "real_estate" }),
  ];
  const filtered = filterLoanRegister(rows, {
    status: "unpaid",
    segment: "all",
    aging: "all",
    collateral: "car_refinancing",
  });
  assert.deepEqual(
    filtered.map((r) => r.masterlistId),
    ["b"],
  );
});

test("paginateRows clamps page and uses allowed page sizes", () => {
  assert.deepEqual(PAGE_SIZES, [10, 20, 30, 50, 100]);
  const rows = Array.from({ length: 25 }, (_, i) =>
    loan({ masterlistId: String(i), borrowerId: String(i) }),
  );
  const first = paginateRows(rows, 1, 10);
  assert.equal(first.page, 1);
  assert.equal(first.pageCount, 3);
  assert.equal(first.slice.length, 10);
  const clamped = paginateRows(rows, 99, 10);
  assert.equal(clamped.page, 3);
  assert.equal(clampPage(0, 3), 1);
});

test("filterPastDue excludes paid and current", () => {
  const rows = [
    loan({ masterlistId: "paid91", borrowerId: "1", accountStatus: "paid", agingBucket: "91+", outstanding: 0 }),
    loan({ masterlistId: "current", borrowerId: "2", accountStatus: "active", agingBucket: "current" }),
    loan({ masterlistId: "late30", borrowerId: "3", accountStatus: "active", agingBucket: "1-30", outstanding: 10 }),
    loan({ masterlistId: "rem91", borrowerId: "4", accountStatus: "remedial", agingBucket: "91+", outstanding: 20 }),
  ];
  const all = filterPastDue(rows, "all");
  assert.deepEqual(
    all.map((r) => r.masterlistId),
    ["late30", "rem91"],
  );
});

test("filterPastDue par30 excludes 1-30", () => {
  const rows = [
    loan({ masterlistId: "a", borrowerId: "1", agingBucket: "1-30" }),
    loan({ masterlistId: "b", borrowerId: "2", agingBucket: "31-60" }),
    loan({ masterlistId: "c", borrowerId: "3", agingBucket: "91+" }),
  ];
  assert.deepEqual(
    filterPastDue(rows, "par30").map((r) => r.masterlistId),
    ["b", "c"],
  );
  assert.deepEqual(
    filterPastDue(rows, "1-30").map((r) => r.masterlistId),
    ["a"],
  );
});

