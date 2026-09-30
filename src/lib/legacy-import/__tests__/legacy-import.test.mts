import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseCsv, toCsv } from "../csv";
import { canValidate, requiredCoverage, type ColumnMapping } from "../fields";
import {
  parseBorrowerType,
  parseDate,
  parseLoanEntryType,
  parseNumber,
  splitFullName,
} from "../normalize";
import { normalizeHeader, suggestMapping } from "../suggest";
import { flagDuplicateLoanNos, summarize, validateRow, validateRows } from "../validate";

const SF_CALC_HEADERS = [
  "Borrower Number", "Loan Number", "Borrower's Name", "Address", "Birthday", "Co-Borrower",
  "Loan Entry Type", "Borrower Type", "Released Date", "Payment Date", "Loan Desired", "Terms",
  "Monthly Amort.", "Interest Rate", "Processing Fee Rate", "Admin Cost Rate", "Interest",
  "Add-on Interest", "Payment Start", "Payment End", "NET DESIRED", "Processing Fee", "Notary Fee",
  "Other Loan", "Account Opening", "Security Fee", "Admin Cost", "Documentary Stamp", "Previous Loan",
  "Advance Payment", "Cash Card", "Total Loan Amount", "Total Interest", "Principal Loan",
  "Total Deduction", "Net Loan Amount", "Branch Office", "ID For Notary (Borrower)", "Id place/date",
  "ID For Notary (Co-Borrower)", "Id place/date", "Company Name", "Principal Ship", "Interest from",
  "Interest to", "Bank to be released", "Accout Number", "Check Number", "Borrower Issued Check",
  "Account number", "Bank Name Under", "BANK NAME", "CARD NUMBER", "PIN", "ACCOUNT TYPE",
  "INITIAL BALANCE", "REMARKS", "ADDITIONAL REMARKS", "Released Check", "Bank / Branch",
  "Account number", "Check Number", "Amount", "Bank / Branch", "Account number", "Check Number",
  "Amount", "TIN", "Agent", "Sub-Agent", "Calculator Setting", "Check Issued No.",
  "Blank Check Issued No.", "Prepared By", "Date Modified",
];

function target(m: ColumnMapping[], col1Based: number) {
  return m[col1Based - 1].target;
}

describe("legacy import — header auto-suggest", () => {
  it("normalizes case and punctuation", () => {
    assert.equal(normalizeHeader(" Monthly Amort. "), "monthlyamort");
    assert.equal(normalizeHeader("Bank / Branch"), "bankbranch");
  });

  it("maps the SF calculator Data header by column index, incl. repeated check blocks", () => {
    const m = suggestMapping(SF_CALC_HEADERS, "seafarer");
    assert.equal(target(m, 1), "legacy_borrower_no");
    assert.equal(target(m, 2), "legacy_loan_no");
    assert.equal(target(m, 3), "full_name");
    assert.equal(target(m, 47), "account_number"); // "Accout Number" typo
    assert.equal(target(m, 48), null); // standalone Check Number: blocks win
    assert.equal(target(m, 50), null); // duplicate account number concept
    assert.equal(target(m, 60), "check1_bank");
    assert.equal(target(m, 61), "check1_account");
    assert.equal(target(m, 62), "check1_number");
    assert.equal(target(m, 63), "check1_amount");
    assert.equal(target(m, 64), "check2_bank");
    assert.equal(target(m, 67), "check2_amount");
    assert.equal(target(m, 36), "net_released");
    assert.equal(target(m, 21), null); // NET DESIRED not auto-mapped (would duplicate)
    const targets = m.map((x) => x.target).filter(Boolean);
    assert.equal(new Set(targets).size, targets.length, "no duplicate targets");
  });

  it("maps repeated SME vehicle/property headers in order", () => {
    const headers = [
      "Make / Year Model", "Registered Owner ", "Make / Year Model", "Registered Owner ",
      "Registered Owner ", "TCT / CCT No.", "Registered Owner ", "TCT / CCT No.",
    ];
    const m = suggestMapping(headers, "sme");
    assert.deepEqual(
      m.map((x) => x.target),
      [
        "vehicle1_make_year_model", "vehicle1_registered_owner",
        "vehicle2_make_year_model", "vehicle2_registered_owner",
        "vehicle3_registered_owner", "property1_tct_no",
        "vehicle4_registered_owner", "property2_tct_no",
      ],
    );
  });

  it("does not suggest SME-only fields for seafarer", () => {
    const m = suggestMapping(["Nature of Business", "CM Fee"], "seafarer");
    assert.deepEqual(m.map((x) => x.target), [null, null]);
  });
});

describe("legacy import — value normalization", () => {
  it("parses numbers and rejects text in numeric columns", () => {
    assert.deepEqual(parseNumber("1,234.50"), { ok: true, value: 1234.5 });
    assert.deepEqual(parseNumber(300000), { ok: true, value: 300000 });
    assert.deepEqual(parseNumber("12%"), { ok: true, value: 12 });
    assert.deepEqual(parseNumber(""), { ok: true, value: null });
    assert.equal(parseNumber("300,000.00/10,300,000.00").ok, false);
    assert.equal(parseNumber("abc").ok, false);
  });

  it("parses dates: ISO, MM/DD/YYYY and Excel serials", () => {
    assert.deepEqual(parseDate("2024-03-05"), { ok: true, value: "2024-03-05" });
    assert.deepEqual(parseDate("03/05/2024"), { ok: true, value: "2024-03-05" });
    assert.deepEqual(parseDate(45356), { ok: true, value: "2024-03-05" });
    assert.equal(parseDate("13/45/2024").ok, false);
    assert.equal(parseDate("soon").ok, false);
  });

  it("normalizes loan entry type and borrower type", () => {
    assert.deepEqual(parseLoanEntryType("FRESH NNO BRONZE"), { ok: true, value: false });
    assert.deepEqual(parseLoanEntryType("reloan gold"), { ok: true, value: true });
    assert.equal(parseLoanEntryType("NEW").ok, false);
    assert.deepEqual(parseBorrowerType("SEAMAN"), { ok: true, value: "seafarer" });
    assert.deepEqual(parseBorrowerType("Allottee"), { ok: true, value: "seafarer" });
    assert.deepEqual(parseBorrowerType("SEAFARER"), { ok: true, value: "seafarer" });
  });

  it("splits full names", () => {
    assert.deepEqual(splitFullName("DELA CRUZ, JUAN P."), { first: "JUAN P.", last: "DELA CRUZ" });
    assert.deepEqual(splitFullName("Juan Santos"), { first: "Juan", last: "Santos" });
  });

  it("round-trips CSV with quotes and neutralizes formulas", () => {
    assert.deepEqual(parseCsv('a,"b,c","d""e"\r\n1,2,3'), [["a", "b,c", 'd"e'], ["1", "2", "3"]]);
    assert.equal(toCsv([["=SUM(A1)", "x,y"]]), `'=SUM(A1),"x,y"`);
  });
});

describe("legacy import — row validation", () => {
  const REQUIRED = [
    "full_name", "input_amount", "terms", "monthly_amortization", "interest_rate", "pf_rate",
    "principal", "total_loan", "total_interest", "net_released", "processing_fee", "notary_fee",
    "security_fee", "admin_cost", "doc_stamp", "total_deductions",
  ];
  const mapping: ColumnMapping[] = [
    { index: 0, header: "Loan Number", target: "legacy_loan_no" },
    { index: 1, header: "Borrower Number", target: "legacy_borrower_no" },
    { index: 2, header: "Loan Entry Type", target: "loan_entry_type" },
    ...REQUIRED.map((t, i) => ({ index: i + 3, header: t, target: t })),
  ];
  const good = (loanNo: string, name = "Juan Santos") => [
    loanNo, "B-1", "FRESH NNO BRONZE", name, 100000, 12, 10000, 3, 5,
    100000, 136000, 36000, 90000, 5000, 200, 300, 1000, 750, 7250,
  ];

  it("gates Validate on required coverage but not on email", () => {
    assert.equal(canValidate(mapping, "seafarer"), true);
    const email = requiredCoverage(mapping, "seafarer").find((r) => r.label === "Email");
    assert.equal(email?.covered, false);
    assert.equal(email?.gating, false);
    assert.equal(canValidate(mapping.slice(0, -1), "seafarer"), false);
    assert.equal(canValidate([...mapping, { index: 99, header: "x", target: "terms" }], "seafarer"), false);
  });

  it("accepts a good row with only the email warning", () => {
    const r = validateRow({ rowNumber: 3, cells: good("L-1") }, mapping, "seafarer");
    assert.equal(r.status, "warning");
    assert.deepEqual(r.errors, []);
    assert.equal(r.warnings.length, 1);
  });

  it("errors on text in numeric columns and missing required values", () => {
    const cells = good("L-1");
    cells[4] = "300,000.00/10,300,000.00";
    cells[5] = null as unknown as number;
    const r = validateRow({ rowNumber: 4, cells }, mapping, "seafarer");
    assert.equal(r.status, "error");
    assert.ok(r.errors.some((e) => e.startsWith("Loan Desired: not a number")));
    assert.ok(r.errors.includes("Terms is required"));
  });

  it("flags DUMMY names, existing DB keys and in-file duplicates", () => {
    const rows = [
      { rowNumber: 3, cells: good("L-1", "DUMMY") },
      { rowNumber: 4, cells: good("L-1") },
      { rowNumber: 5, cells: good("L-9") },
      { rowNumber: 6, cells: good("").map(() => null) },
    ];
    const res = flagDuplicateLoanNos(
      validateRows(rows, mapping, "seafarer", { borrowerNos: new Set(), loanNos: new Set(["L-9"]) }),
    );
    assert.equal(res.length, 3, "blank row skipped");
    assert.ok(res[0].warnings.some((w) => w.includes("placeholder")));
    assert.ok(res[0].errors.some((e) => e.includes("duplicated in this file (also row 4)")));
    assert.ok(res[2].errors.some((e) => e.includes("already exists")));
    assert.deepEqual(summarize(res), { total: 3, valid: 0, warning: 0, error: 3 });
  });

  it("requires check date/amount/bank when a check has data", () => {
    const m: ColumnMapping[] = [...mapping, { index: 30, header: "Check Number", target: "check1_number" }];
    const cells: unknown[] = good("L-2");
    cells[30] = "000123";
    const r = validateRow({ rowNumber: 7, cells: cells as never }, m, "seafarer");
    assert.ok(r.errors.some((e) => e.includes("Check 1 — Check Date is required")));
  });
});
