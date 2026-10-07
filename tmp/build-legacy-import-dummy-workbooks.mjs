import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = path.resolve("outputs/legacy-import-dummy-data-20261007");

const accountHeaders = [
  "Legacy Loan No.", "First Name", "Middle Name", "Last Name", "Suffix", "Email", "Mobile Phone", "Birthday", "Address",
  "Loan Entry Type", "Borrower Type", "Loan Desired", "Released Date", "Payment Start", "Terms", "Payment Frequency", "Payment Schedule", "Schedule Type", "Due Day", "Loan Type Name",
  "Principal Loan", "Total Interest", "Total Loan Amount", "Net Loan Amount", "Monthly Amort.", "Processing Fee", "Admin Cost", "Documentary Stamp",
  "Notary Fee", "Security Fee", "Other Deductions Total", "Total Deduction", "Processing Fee Rate (%)", "Interest Rate (%)", "Security Fee Rate",
  "Outstanding Balance", "Balance As Of", "Account Status", "Closed At",
];

const installmentsHeaders = [
  "Legacy Loan No.", "Installment No.", "Due Date", "Amount Due", "Amount Paid", "Discount",
  "Penalty Charged", "Penalty Waived", "Penalty Paid", "Status", "Paid Date", "Line Type",
];

function date(value) {
  return new Date(`${value}T00:00:00Z`);
}

function columnName(index) {
  let value = index;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function createInstallments(loanNo) {
  return Array.from({ length: 12 }, (_, index) => {
    const installmentNo = index + 1;
    const amountPaid = installmentNo <= 3 ? 10000 : installmentNo === 4 ? 4000 : 0;
    return [
      loanNo,
      installmentNo,
      date(`2026-${String(installmentNo).padStart(2, "0")}-10`),
      10000,
      amountPaid,
      0,
      installmentNo === 4 ? 500 : 0,
      0,
      0,
      installmentNo <= 3 ? "paid" : installmentNo === 4 ? "partial" : "pending",
      installmentNo <= 3 ? date(`2026-${String(installmentNo).padStart(2, "0")}-10`) : null,
      "amortization",
    ];
  });
}

function styleTable(sheet, rangeAddress, headerAddress, dateColumns, currencyColumns, percentColumns = []) {
  sheet.getRange(rangeAddress).format.font = { name: "Arial", size: 10, color: "#1F2937" };
  sheet.getRange(rangeAddress).format.verticalAlignment = "center";
  sheet.getRange(headerAddress).format = {
    fill: "#1F4E78",
    font: { name: "Arial", size: 10, bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
    borders: { preset: "all", style: "thin", color: "#FFFFFF" },
  };
  dateColumns.forEach((column) => sheet.getRange(column).format.numberFormat = "yyyy-mm-dd");
  currencyColumns.forEach((column) => sheet.getRange(column).format.numberFormat = "#,##0.00");
  percentColumns.forEach((column) => sheet.getRange(column).format.numberFormat = "0.00%");
  sheet.getRange(rangeAddress).format.autofitColumns();
  sheet.getRange(headerAddress).format.rowHeight = 36;
  sheet.showGridLines = false;
  sheet.freezePanes.freezeRows(1);
}

async function buildWorkbook({ fileName, loanNo, borrower, segmentHeaders, segmentValues }) {
  const workbook = Workbook.create();
  const accounts = workbook.worksheets.add("Accounts");
  const installments = workbook.worksheets.add("Installments");
  const payments = workbook.worksheets.add("Payments");
  const pdcChecks = workbook.worksheets.add("PDC Checks");
  const instructions = workbook.worksheets.add("Instructions");

  const allHeaders = [...accountHeaders, ...segmentHeaders];
  const lastAccountColumn = columnName(allHeaders.length);
  const accountRow = [
    loanNo, borrower.firstName, borrower.middleName, borrower.lastName, "", borrower.email, borrower.mobile, date(borrower.birthDate), borrower.address,
    "fresh", borrower.segment, 100000, date("2025-12-10"), date("2026-01-10"), 12, "monthly", borrower.segment === "individual" ? "mpl" : "monthly", "monthly", 10, borrower.loanType,
    100000, 20000, 120000, 95000, 10000, 3000, 1000, 0, 0, 1000, 0, 5000, 0.03, 0.20, 0.01,
    86500, date("2026-04-10"), "active", null,
    ...segmentValues,
  ];
  const paidNo = loanNo.replace(/001$/, "002");
  const unpaidNo = loanNo.replace(/001$/, "003");
  const paidRow = [...accountRow], unpaidRow = [...accountRow];
  const set = (row, header, value) => { row[allHeaders.indexOf(header)] = value; };
  for (const [row, number, suffix] of [[paidRow, paidNo, "Paid"], [unpaidRow, unpaidNo, "Unpaid"]]) {
    set(row, "Legacy Loan No.", number); set(row, "Last Name", `${borrower.lastName}${suffix}`);
    set(row, "Email", borrower.email.replace("@", `.${suffix.toLowerCase()}@`));
    set(row, "Balance As Of", date("2026-10-07"));
  }
  set(paidRow, "Outstanding Balance", 0); set(paidRow, "Account Status", "paid");
  set(paidRow, "Closed At", date("2025-12-10"));
  set(paidRow, "Released Date", date("2024-12-10")); set(paidRow, "Payment Start", date("2025-01-10"));
  set(unpaidRow, "Outstanding Balance", 120000);
  set(unpaidRow, "Released Date", date("2026-09-10")); set(unpaidRow, "Payment Start", date("2026-10-10"));
  accounts.getRangeByIndexes(0, 0, 4, allHeaders.length).values = [allHeaders, accountRow, paidRow, unpaidRow];
  accounts.tables.add(`A1:${lastAccountColumn}4`, true, "AccountsTable");
  styleTable(accounts, `A1:${lastAccountColumn}4`, `A1:${lastAccountColumn}1`, ["H2:H4", "M2:N4", "AK2:AK4", "AM2:AM4"], ["U2:AF4", "AJ2:AJ4"], ["AG2:AI4"]);

  const paidLines = createInstallments(paidNo).map((line, i) => {
    const row = [...line]; row[2] = date(`2025-${String(i+1).padStart(2,"0")}-10`);
    row[4] = 10000; row[6] = 0; row[9] = "paid"; row[10] = row[2]; return row;
  });
  const unpaidLines = createInstallments(unpaidNo).map((line, i) => {
    const row = [...line]; row[2] = new Date(Date.UTC(2026, 9+i, 10));
    row[4] = 0; row[6] = 0; row[9] = "pending"; row[10] = null; return row;
  });
  const installmentRows = [...createInstallments(loanNo), ...paidLines, ...unpaidLines];
  installments.getRangeByIndexes(0, 0, installmentRows.length + 1, installmentsHeaders.length).values = [installmentsHeaders, ...installmentRows];
  installments.tables.add("A1:L37", true, "InstallmentsTable");
  styleTable(installments, "A1:L37", "A1:L1", ["C2:C37", "K2:K37"], ["D2:I37"]);

  const paymentHeaders = ["Legacy Loan No.", "Payment Date", "Amount", "Channel", "Reference No."];
  payments.getRange("A1:E2").values = [paymentHeaders, [loanNo, date("2026-01-10"), 10000, "bank_deposit", `DUMMY-${loanNo}-001`]];
  payments.tables.add("A1:E2", true, "PaymentsTable");
  styleTable(payments, "A1:E2", "A1:E1", ["B2"], ["C2"]);

  const pdcHeaders = ["Legacy Loan No.", "Check Number", "Amount", "Check Date", "Bank Name"];
  pdcChecks.getRange("A1:E2").values = [pdcHeaders, [loanNo, `DUMMY-PDC-${loanNo}`, 10000, date("2026-05-10"), "Sample Test Bank"]];
  pdcChecks.tables.add("A1:E2", true, "PdcChecksTable");
  styleTable(pdcChecks, "A1:E2", "A1:E1", ["D2"], ["C2"]);

  instructions.getRange("A1:A9").values = [
    ["Dummy legacy masterlist import data"],
    ["Use only in a local or staging environment. Do not upload this workbook to production."],
    ["Three loans, each with 12 source installments: 001 partially paid, 002 fully paid, 003 completely unpaid."],
    ["Total loan: 120,000.00. Installments paid: 34,000.00. Unpaid penalties: 500.00. Outstanding balance: 86,500.00."],
    ["Installment 4 includes a 500.00 penalty charged. Penalty Waived and Penalty Paid are both zero."],
    ["The Payments sheet is optional historical reference data. It must not create a receipt, DCR, posting, or change the opening balance."],
    ["The PDC Checks sheet contains one sample check."],
    ["Loan 002: balance 0, status paid, closed 2025-12-10. Loan 003: balance 120,000, status active, no payments."],
    ["All data is fictional. Imported paid loans have no collectible installments or invented receipts. Filter AR Masterlist by Source: Imported, then Status: Paid or Active."],
  ];
  instructions.getRange("A1").format = { font: { name: "Arial", size: 14, bold: true, color: "#1F4E78" } };
  instructions.getRange("A2:A9").format = { font: { name: "Arial", size: 10, color: "#1F2937" }, wrapText: true, verticalAlignment: "top" };
  instructions.getRange("A1:A9").format.columnWidth = 120;
  instructions.getRange("A2:A9").format.rowHeight = 30;
  instructions.showGridLines = false;

  workbook.recalculate();
  const check = await workbook.inspect({ kind: "table", range: "Accounts!AJ1:AM4", include: "values,formulas", tableMaxRows: 4, tableMaxCols: 4 });
  const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!", options: { useRegex: true, maxResults: 50 } });
  const preview = await workbook.render({ sheetName: "Accounts", range: "AJ1:AM4", scale: 1.5, format: "png" });
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, `${fileName}.png`), new Uint8Array(await preview.arrayBuffer()));
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(path.join(outputDir, fileName));
  console.log(JSON.stringify({ fileName, accounts: check.ndjson, errors: errors.ndjson }));
}

await buildWorkbook({
  fileName: "legacy-masterlist-dummy-seafarer.xlsx",
  loanNo: "TEST-SF-20261007-001",
  segmentHeaders: ["Manning Agency / Company Name", "Vessel Name"],
  segmentValues: ["Sample Manning Agency", "MV Test Horizon"],
  borrower: { firstName: "Sofia", middleName: "Anne", lastName: "Testseafarer", email: "test.seafarer.20261007@example.com", mobile: "09171234567", birthDate: "1990-02-14", address: "101 Sample Port Road, Manila", loanType: "Seafarer Personal Loan", segment: "seafarer" },
});

await buildWorkbook({
  fileName: "legacy-masterlist-dummy-sme.xlsx",
  loanNo: "TEST-SME-20261007-001",
  borrower: { firstName: "Marco", middleName: "Luis", lastName: "Testbusiness", email: "test.sme.20261007@example.com", mobile: "09181234567", birthDate: "1985-07-21", address: "202 Sample Commerce Street, Quezon City", loanType: "SME Business Loan", segment: "sme" },
  segmentHeaders: ["Business Name", "Entity Type"],
  segmentValues: ["Test Business Trading", "individual"],
});

await buildWorkbook({
  fileName: "legacy-masterlist-dummy-individual.xlsx",
  loanNo: "TEST-IND-20261007-001",
  borrower: { firstName: "Ivy", middleName: "Marie", lastName: "Testindividual", email: "test.individual.20261007@example.com", mobile: "09191234567", birthDate: "1993-11-08", address: "303 Sample Residence Avenue, Makati", loanType: "Individual Personal Loan", segment: "individual" },
  segmentHeaders: ["Individual Loan Type"],
  segmentValues: ["mpl"],
});

// Narrow instruction-only update; preserve all existing template sheets/styles.
for (const segment of ["seafarer", "sme", "individual"]) {
  const target = path.resolve(`public/legacy-import-templates/legacy-masterlist-import-${segment}.xlsx`);
  const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(target));
  wb.worksheets.getItem("Instructions").getRange("A6").values = [["SME Entity Type: individual or corporate. Individual Loan Type: mpl or salary. Account Status: active or paid. Paid loans require zero balance, settled source installments and a Closed At date on or before Balance As Of."]];
  wb.recalculate();
  const inspected = await wb.inspect({ kind: "table", range: "Instructions!A6", include: "values", tableMaxRows: 1, tableMaxCols: 1 });
  console.log(inspected.ndjson);
  const preview = await wb.render({ sheetName: "Instructions", range: "A6:AH6", scale: 1, format: "png" });
  await fs.writeFile(path.join(outputDir, `template-${segment}-instruction.png`), new Uint8Array(await preview.arrayBuffer()));
  const file = await SpreadsheetFile.exportXlsx(wb);
  await file.save(target);
}
