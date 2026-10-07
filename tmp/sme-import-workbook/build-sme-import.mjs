import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "C:/Users/Rovick/Desktop/Loanstar System/loanstar/outputs/sme-legacy-import-dummy";

const headers = [
  "Legacy Borrower No.", "Legacy Loan No.", "Borrower Full Name (split into first/last)", "First Name", "Middle Name", "Last Name", "Suffix", "Email", "Address (single line)", "Co-Borrower / Representative Name", "Co-Borrower Address", "Representative Position", "Nature of Business", "Company TIN", "Loan Entry Type (Fresh/Reloan)", "Borrower Type", "Released Date", "Payment Start", "Loan Desired", "Terms", "Monthly Amort.", "Interest Rate (%)", "Processing Fee Rate (%)", "Admin Cost Rate (%)", "Principal Loan", "Total Loan Amount", "Total Interest", "Net Loan Amount", "Processing Fee", "Notary Fee", "Security Fee", "Admin Cost", "Documentary Stamp", "Total Deduction", "CM Fee (Chattel Mortgage)", "Other Loan", "Account Opening", "Previous Loan", "Advance Payment", "Bank to be Released", "Account Number", "Account Type", "ATM Bank Name", "ATM Card No. (last 4 kept)", "Check 1 — Check Number", "Check 1 — Bank / Branch", "Check 1 — Account Number", "Check 1 — Amount", "Check 1 — Check Date", "Check 2 — Check Number", "Check 2 — Bank / Branch", "Check 2 — Account Number", "Check 2 — Amount", "Check 2 — Check Date", "Vehicle 1 — Make / Year Model", "Vehicle 1 — Engine No.", "Vehicle 1 — Chassis No.", "Vehicle 1 — Plate No.", "Vehicle 1 — CR No.", "Vehicle 1 — MV File No.", "Vehicle 1 — Registered Owner", "Vehicle 2 — Make / Year Model", "Vehicle 2 — Engine No.", "Vehicle 2 — Chassis No.", "Vehicle 2 — Plate No.", "Vehicle 2 — CR No.", "Vehicle 2 — MV File No.", "Vehicle 2 — Registered Owner", "Vehicle 3 — Make / Year Model", "Vehicle 3 — Engine No.", "Vehicle 3 — Chassis No.", "Vehicle 3 — Plate No.", "Vehicle 3 — CR No.", "Vehicle 3 — MV File No.", "Vehicle 3 — Registered Owner", "Vehicle 4 — Make / Year Model", "Vehicle 4 — Engine No.", "Vehicle 4 — Chassis No.", "Vehicle 4 — Plate No.", "Vehicle 4 — CR No.", "Vehicle 4 — MV File No.", "Vehicle 4 — Registered Owner", "Property 1 — Registered Owner", "Property 1 — TCT / CCT No.", "Property 1 — Property Address", "Property 1 — Lot Area (sqm)", "Property 1 — Technical Description", "Property 2 — Registered Owner", "Property 2 — TCT / CCT No.", "Property 2 — Property Address", "Property 2 — Lot Area (sqm)", "Property 2 — Technical Description",
];

const row = (values) => headers.map((header) => values[header] ?? null);
const date = (s) => new Date(`${s}T00:00:00Z`);

const records = [
  row({
    "Legacy Borrower No.": "SME-LOCAL-20261001-001", "Legacy Loan No.": "SML-20261001-001", "Borrower Full Name (split into first/last)": "Aurelia Santos", "First Name": "Aurelia", "Middle Name": "Reyes", "Last Name": "Santos", "Email": "aurelia.santos@example.com", "Address (single line)": "101 Mabini Street, Quezon City", "Co-Borrower / Representative Name": "Marco Santos", "Co-Borrower Address": "101 Mabini Street, Quezon City", "Representative Position": "Owner", "Nature of Business": "Retail grocery", "Company TIN": "123-456-789-000", "Loan Entry Type (Fresh/Reloan)": "FRESH", "Borrower Type": "SME", "Released Date": date("2026-06-15"), "Payment Start": date("2026-07-15"), "Loan Desired": 100000, "Terms": 12, "Monthly Amort.": 9833.33, "Interest Rate (%)": 18, "Processing Fee Rate (%)": 3, "Admin Cost Rate (%)": 1, "Principal Loan": 100000, "Total Loan Amount": 118000, "Total Interest": 18000, "Net Loan Amount": 93800, "Processing Fee": 3000, "Notary Fee": 500, "Security Fee": 500, "Admin Cost": 1000, "Documentary Stamp": 1000, "Total Deduction": 6200, "CM Fee (Chattel Mortgage)": 200, "Other Loan": 0, "Account Opening": 0, "Previous Loan": 0, "Advance Payment": 0, "Bank to be Released": "BDO Unibank", "Account Number": "1234567890", "Account Type": "Savings", "ATM Bank Name": "BDO Unibank", "ATM Card No. (last 4 kept)": "4321", "Check 1 — Check Number": "000125", "Check 1 — Bank / Branch": "BDO Cubao Branch", "Check 1 — Account Number": "1234567890", "Check 1 — Amount": 9833.33, "Check 1 — Check Date": date("2026-07-15"), "Vehicle 1 — Make / Year Model": "Toyota 2022 Vios", "Vehicle 1 — Engine No.": "2NRFEX123456", "Vehicle 1 — Chassis No.": "MROBA3CDX12345678", "Vehicle 1 — Plate No.": "NCR1234", "Vehicle 1 — CR No.": "CR-2026-0001", "Vehicle 1 — MV File No.": "MVF-2026-0001", "Vehicle 1 — Registered Owner": "Aurelia Santos", "Property 1 — Registered Owner": "Aurelia Santos", "Property 1 — TCT / CCT No.": "TCT-123456", "Property 1 — Property Address": "101 Mabini Street, Quezon City", "Property 1 — Lot Area (sqm)": 120, "Property 1 — Technical Description": "Residential lot, Lot 12 Block 4",
  }),
  row({
    "Legacy Borrower No.": "SME-LOCAL-20261001-002", "Legacy Loan No.": "SML-20261001-002", "Borrower Full Name (split into first/last)": "Benito Cruz", "First Name": "Benito", "Middle Name": "Lopez", "Last Name": "Cruz", "Email": "benito.cruz@example.com", "Address (single line)": "25 Rizal Avenue, Makati City", "Co-Borrower / Representative Name": "Lina Cruz", "Co-Borrower Address": "25 Rizal Avenue, Makati City", "Representative Position": "Managing Partner", "Nature of Business": "Food services", "Company TIN": "234-567-890-000", "Loan Entry Type (Fresh/Reloan)": "RELOAN", "Borrower Type": "SME", "Released Date": date("2026-07-01"), "Payment Start": date("2026-08-01"), "Loan Desired": 150000, "Terms": 15, "Monthly Amort.": 11500, "Interest Rate (%)": 15, "Processing Fee Rate (%)": 2.5, "Admin Cost Rate (%)": 1, "Principal Loan": 150000, "Total Loan Amount": 172500, "Total Interest": 22500, "Net Loan Amount": 140500, "Processing Fee": 3750, "Notary Fee": 500, "Security Fee": 750, "Admin Cost": 1500, "Documentary Stamp": 1500, "Total Deduction": 9500, "CM Fee (Chattel Mortgage)": 1500, "Other Loan": 0, "Account Opening": 0, "Previous Loan": 0, "Advance Payment": 0, "Bank to be Released": "Metrobank", "Account Number": "9876543210", "Account Type": "Current", "ATM Bank Name": "Metrobank", "ATM Card No. (last 4 kept)": "8765",
  }),
  row({
    "Legacy Borrower No.": "SME-LOCAL-20261001-003", "Legacy Loan No.": "SML-20261001-003", "Borrower Full Name (split into first/last)": "Celia Ramos", "First Name": "Celia", "Middle Name": "Garcia", "Last Name": "Ramos", "Email": "celia.ramos@example.com", "Address (single line)": "8 Bonifacio Road, Pasig City", "Co-Borrower / Representative Name": "Noel Ramos", "Co-Borrower Address": "8 Bonifacio Road, Pasig City", "Representative Position": "Proprietor", "Nature of Business": "Printing services", "Company TIN": "345-678-901-000", "Loan Entry Type (Fresh/Reloan)": "FRESH", "Borrower Type": "SME", "Released Date": date("2026-08-10"), "Payment Start": date("2026-09-10"), "Loan Desired": 200000, "Terms": 20, "Monthly Amort.": 11800, "Interest Rate (%)": 18, "Processing Fee Rate (%)": 3, "Admin Cost Rate (%)": 1, "Principal Loan": 200000, "Total Loan Amount": 236000, "Total Interest": 36000, "Net Loan Amount": 185800, "Processing Fee": 6000, "Notary Fee": 750, "Security Fee": 1000, "Admin Cost": 2000, "Documentary Stamp": 2000, "Total Deduction": 14200, "CM Fee (Chattel Mortgage)": 2450, "Other Loan": 0, "Account Opening": 0, "Previous Loan": 0, "Advance Payment": 0, "Bank to be Released": "Security Bank", "Account Number": "4567890123", "Account Type": "Savings", "ATM Bank Name": "Security Bank", "ATM Card No. (last 4 kept)": "0123", "Property 2 — Registered Owner": "Celia Ramos", "Property 2 — TCT / CCT No.": "TCT-654321", "Property 2 — Property Address": "8 Bonifacio Road, Pasig City", "Property 2 — Lot Area (sqm)": 85, "Property 2 — Technical Description": "Commercial lot, Lot 8 Block 2",
  }),
];

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("SME Import");
sheet.showGridLines = false;
sheet.getRangeByIndexes(0, 0, records.length + 1, headers.length).values = [headers, ...records];
sheet.getRangeByIndexes(0, 0, 1, headers.length).format = { fill: "#1F4E78", font: { name: "Arial", size: 10, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true };
sheet.getRangeByIndexes(1, 0, records.length, headers.length).format = { font: { name: "Arial", size: 10 }, verticalAlignment: "center" };
sheet.getRangeByIndexes(0, 0, records.length + 1, headers.length).format.borders = { preset: "all", style: "thin", color: "#D9E2F3" };
sheet.getRange("A:CN").format.columnWidth = 16;
sheet.getRange("A1:CN1").format.rowHeight = 42;
sheet.getRange("A:A").format.columnWidth = 28;
sheet.getRange("B:B").format.columnWidth = 22;
sheet.getRange("C:C").format.columnWidth = 28;
sheet.getRange("H:H").format.columnWidth = 30;
sheet.getRange("I:I").format.columnWidth = 36;
sheet.getRange("J:J").format.columnWidth = 26;
sheet.getRange("K:K").format.columnWidth = 36;
sheet.getRange("M:M").format.columnWidth = 24;
sheet.getRange("N:N").format.columnWidth = 20;
sheet.getRange("AN:AN").format.columnWidth = 24;
sheet.getRange("AO:AO").format.columnWidth = 26;
sheet.getRange("AP:AP").format.columnWidth = 20;
sheet.getRange("AU:AU").format.columnWidth = 22;
sheet.getRange("AV:AV").format.columnWidth = 28;
sheet.getRange("BF:BF").format.columnWidth = 28;
sheet.getRange("BG:BG").format.columnWidth = 24;
sheet.getRange("BH:BH").format.columnWidth = 38;
sheet.getRange("BJ:BJ").format.columnWidth = 38;
sheet.getRange("BK:BK").format.columnWidth = 28;
sheet.getRange("BL:BL").format.columnWidth = 38;
sheet.getRange("R:R").format.numberFormat = "yyyy-mm-dd";
sheet.getRange("Q:Q").format.numberFormat = "yyyy-mm-dd";
sheet.getRange("AW:AW").format.numberFormat = "yyyy-mm-dd";
sheet.getRange("AV:AV").format.numberFormat = "#,##0.00";
sheet.getRange("S:S").format.numberFormat = "#,##0.00";
sheet.getRange("U:U").format.numberFormat = "#,##0.00";
sheet.getRange("V:X").format.numberFormat = "0.00";
sheet.getRange("Y:AM").format.numberFormat = "#,##0.00";
sheet.getRange("BI:BI").format.numberFormat = "#,##0.00";
sheet.getRange("BN:BN").format.numberFormat = "#,##0.00";
sheet.freezePanes.freezeRows(1);
workbook.recalculate();

const inspection = await workbook.inspect({ kind: "table", range: "SME Import!A1:CN4", include: "values,formulas", tableMaxRows: 4, tableMaxCols: headers.length });
const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!", options: { useRegex: true, maxResults: 300 }, summary: "formula error scan" });
const preview = await workbook.render({ sheetName: "SME Import", range: "A1:CN4", scale: 1, format: "png" });
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(`${outputDir}/preview.png`, new Uint8Array(await preview.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}/legacy-import-template-sme-dummy-data.xlsx`);
console.log(inspection.ndjson);
console.log(errors.ndjson);
