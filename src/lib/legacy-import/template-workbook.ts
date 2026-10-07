import ExcelJS from "exceljs";

export type AccountTemplateSegment = "seafarer" | "sme" | "individual";

const accountHeaders = [
  "Legacy Loan No.", "First Name", "Middle Name", "Last Name", "Suffix", "Email", "Mobile Phone", "Date of Birth", "Present Address",
  "Release Date", "First Payment Date", "Terms", "Payment Frequency", "Payment Schedule", "Schedule Type", "Due Day", "Loan Type Name",
  "Loan Desired", "Principal", "Total Interest", "Total Loan", "Net Released", "Monthly Amortization", "Processing Fee", "Admin Cost", "Doc Stamp",
  "Notary Fee", "Security Fee", "Other Deductions Total", "Total Deductions", "PF Rate", "Interest Rate", "Security Fee Rate",
  "Outstanding Balance", "Balance As Of", "Account Status", "Closed At",
];

const segmentHeaders: Record<AccountTemplateSegment, string[]> = {
  seafarer: ["Manning Agency", "Vessel"],
  sme: ["Business Name", "Entity Type"],
  individual: ["Individual Loan Type"],
};

export function buildTemplateWorkbook(segment: AccountTemplateSegment): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Accounts").addRow([...accountHeaders, ...segmentHeaders[segment]]);
  workbook.addWorksheet("Installments").addRow([
    "Legacy Loan No.", "Installment No.", "Due Date", "Amount Due", "Amount Paid", "Discount",
    "Penalty Charged", "Penalty Waived", "Penalty Paid", "Status", "Paid Date", "Line Type",
  ]);
  workbook.addWorksheet("Payments").addRow(["Legacy Loan No.", "Payment Date", "Amount", "Channel", "Reference No."]);
  workbook.addWorksheet("PDC Checks").addRow(["Legacy Loan No.", "Check Number", "Amount", "Check Date", "Bank Name"]);
  workbook.addWorksheet("Instructions").addRows([
    ["Legacy Masterlist Import Instructions"],
    ["The Installments sheet is the source of the opening loan balance."],
    ["Outstanding Balance must exactly equal unpaid installment amounts plus unpaid penalties. Balance As Of cannot be in the future."],
    ["Keep original installment numbers and due dates. Use 0 for monetary values that do not apply."],
    ["Loan Desired is the original requested loan amount, not the remaining balance."],
    ["SME Entity Type: individual or corporate. Individual Loan Type: mpl or salary. Account Status: active or paid. Paid loans require zero balance, settled source installments and a Closed At date on or before Balance As Of."],
    ["Penalty Charged is the cumulative penalty already charged."],
    ["Penalty Waived and Penalty Paid are separate values."],
    ["Amount Paid excludes penalty money."],
    ["Payments is optional legacy reference history only. They do not create LoanStar receipts, DCRs, postings, or change the LoanStar balance."],
  ]);
  return workbook;
}
