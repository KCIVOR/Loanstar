import { canValidate, duplicateTargets, type ColumnMapping, type LegacySegment } from "./fields";
import { cleanText, isBlankRow, parseDate, parseNumber, splitFullName, type CellValue } from "./normalize";
import { normalizeHeader } from "./suggest";
import { parseByField, validateRow, type InputRow } from "./validate";

export type ImportInstallment = { installment_no: number; due_date: string; amount_due: number; penalty_amount: number; line_type: string };
export type ImportAccount = { rowNumber: number; values: Record<string, unknown>; installments: ImportInstallment[]; settledSource?: { count: number; originalAmount: number } };
export type ImportOutcome = { rowNumber: number; loanNo: string; status: "imported" | "failed"; message: string; masterlistId?: string };
const cents = (n: number) => Math.round(n * 100);

/** Pure preflight, shared by the preview and protected write route. No database calls. */
export function buildActiveImport(rows: readonly InputRow[], mapping: readonly ColumnMapping[], segment: LegacySegment, sheet: readonly (readonly unknown[])[], today: string) {
  const errors: string[] = [];
  const accounts: ImportAccount[] = [];
  if (!canValidate(mapping, segment) || duplicateTargets(mapping).length) return { accounts, errors: ["Complete the required account mapping first."] };
  const header = sheet[0]?.map(normalizeHeader) ?? [];
  const index = (name: string) => header.indexOf(normalizeHeader(name));
  const required = ["Legacy Loan No.", "Installment No.", "Due Date", "Amount Due", "Amount Paid", "Discount", "Penalty Charged", "Penalty Waived", "Penalty Paid"];
  if (required.some(name => index(name) < 0)) return { accounts, errors: ["The Installments sheet needs these headers: " + required.join(", ")] };
  const loanNos = new Set<string>();
  for (const row of rows) {
    const before = errors.length;
    const fail = (message: string) => errors.push(`Accounts row ${row.rowNumber}: ${message}`);
    const valid = validateRow(row, mapping, segment);
    valid.errors.forEach(fail);
    const values: Record<string, unknown> = { segment };
    for (const m of mapping) {
      if (!m.target) continue;
      const parsed = parseByField(m.target, row.cells[m.index] ?? null);
      if (parsed.ok && parsed.value != null) values[m.target] = parsed.value;
    }
    if (!values.first_name || !values.last_name) {
      const split = splitFullName((values.full_name ?? null) as CellValue);
      if (split) { values.first_name = split.first; values.last_name = split.last; }
    }
    const loanNo = String(values.legacy_loan_no ?? "");
    if (!loanNo) fail("Legacy Loan No. is required.");
    if (loanNos.has(loanNo)) fail("Duplicate legacy loan number.");
    loanNos.add(loanNo);
    if (!values.email) fail("Email is required to create the borrower record.");
    if (values.borrower_type && values.borrower_type !== segment) fail("Borrower Type must match the selected segment.");
    const status = String(values.account_status ?? "active").toLowerCase();
    const paidAccount = status === "paid";
    values.account_status = status;
    if (!["active", "paid"].includes(status)) fail("Account Status must be active or paid.");
    if (!(typeof values.outstanding_balance === "number" && (paidAccount ? values.outstanding_balance === 0 : values.outstanding_balance > 0))) fail("Outstanding Balance must be zero for a paid loan and greater than zero for an active loan.");
    const asOf = String(values.balance_as_of ?? "");
    if (!asOf || asOf > today) fail("Balance As Of must be a valid date on or before today.");
    const closed = String(values.closed_at ?? "");
    if (paidAccount && (!closed || closed > asOf || (values.release_date && closed < String(values.release_date)))) fail("Paid loans require Closed At on or after release and on or before Balance As Of.");
    if (!paidAccount && closed) fail("An active loan cannot have a Closed At date.");
    if (segment === "sme") {
      if (!["individual", "corporate"].includes(String(values.entity_type ?? ""))) fail("Entity Type must be individual or corporate.");
      if (!values.business_name) fail("Business Name is required for SME.");
    }
    if (segment === "individual" && !["mpl", "salary"].includes(String(values.individual_loan_type ?? ""))) fail("Individual Loan Type must be mpl or salary.");
    const frequency = String(values.payment_frequency ?? "monthly");
    const frequencies = ["monthly", "semi_monthly", "weekly", "bi_monthly", "quarterly", "two_monthly", "daily", "quarterly_special", "two_monthly_special"];
    if (!frequencies.includes(frequency)) fail("Unsupported Payment Frequency.");
    values.payment_frequency = frequency;
    const schedule = String(values.schedule_type ?? "monthly");
    if (!["monthly", "weekly", "bi_monthly", "quarterly", "two_monthly", "daily"].includes(schedule) || (segment !== "sme" && schedule !== "monthly")) fail("Schedule Type is invalid for this segment.");
    values.schedule_type = schedule;
    const payment = String(values.payment_schedule ?? (segment === "individual" ? values.individual_loan_type : frequency));
    if (!["mpl", "salary", ...frequencies.filter(f => f !== "semi_monthly")].includes(payment) || (segment === "seafarer" && payment !== "monthly")) fail("Payment Schedule is invalid for this segment.");
    values.payment_schedule = payment;
    for (const key of ["principal", "total_loan", "total_interest", "net_released", "monthly_amortization", "processing_fee", "notary_fee", "security_fee", "admin_cost", "doc_stamp", "total_deductions", "interest_rate", "pf_rate", "input_amount", "security_fee_rate", "other_deductions_total", "admin_rate"]) {
      if (typeof values[key] === "number" && Number(values[key]) < 0) fail(`${key} cannot be negative.`);
    }
    if (values.due_day != null && (Number(values.due_day) < 1 || Number(values.due_day) > 31)) fail("Due Day must be between 1 and 31.");
    if (Number(values.total_loan) <= 0 || Number(values.principal) <= 0 || Number(values.monthly_amortization) <= 0) fail("Loan amounts and monthly amortization must be positive.");
    const installments: ImportInstallment[] = [];
    const seen = new Set<number>();
    let sourceAmount = 0;
    for (let i = 1; i < sheet.length; i++) {
      const line = sheet[i];
      if (isBlankRow(line) || cleanText((line[index("Legacy Loan No.")] ?? null) as CellValue) !== loanNo) continue;
      const get = (name: string) => (line[index(name)] ?? null) as CellValue;
      const money = (name: string) => {
        const parsed = parseNumber(get(name));
        if (!parsed.ok || parsed.value === null || parsed.value < 0 || !Number.isSafeInteger(cents(parsed.value))) { fail(`Installments row ${i + 1}: ${name} must be a nonnegative number (use 0 when none).`); return 0; }
        return cents(parsed.value);
      };
      const n = parseNumber(get("Installment No."));
      const number = n.ok ? n.value : null;
      if (number === null || !Number.isInteger(number) || number < 1) { fail(`Installments row ${i + 1}: invalid installment number.`); continue; }
      if (seen.has(number)) fail(`Duplicate installment number ${number}.`);
      seen.add(number);
      const date = parseDate(get("Due Date"));
      if (!date.ok || !date.value) { fail(`Installments row ${i + 1}: invalid Due Date.`); continue; }
      const due = money("Amount Due"), paid = money("Amount Paid"), discount = money("Discount");
      sourceAmount += due;
      const penalty = money("Penalty Charged"), waived = money("Penalty Waived"), feePaid = money("Penalty Paid");
      const remaining = due - paid - discount, fee = penalty - waived - feePaid;
      if (remaining < 0 || fee < 0) fail(`Installments row ${i + 1}: paid/waived amounts exceed the amount owed.`);
      const status = (cleanText(get("Status")) || "pending").toLowerCase();
      if (!["pending", "partial", "paid", "overdue", "moved", "rolled"].includes(status)) fail(`Installments row ${i + 1}: invalid Status.`);
      if (["moved", "rolled"].includes(status)) fail("Moved or rolled installments require a resolved unpaid schedule before import.");
      if (status === "paid" && remaining + fee > 0) fail(`Installments row ${i + 1}: paid row still has an unpaid balance.`);
      if (remaining + fee <= 0) continue;
      const rawType = (cleanText(get("Line Type")) || "standard").toLowerCase();
      const lineType = rawType === "amortization" ? "standard" : rawType;
      if (!["standard", "interest", "principal"].includes(lineType)) fail(`Installments row ${i + 1}: invalid Line Type.`);
      installments.push({ installment_no: number, due_date: date.value, amount_due: remaining / 100, penalty_amount: fee / 100, line_type: lineType });
    }
    if (paidAccount && (!seen.size || sourceAmount <= 0)) fail("A paid loan requires settled source installments with a positive original amount.");
    if (paidAccount && sourceAmount !== cents(Number(values.total_loan))) fail("Paid source installments must cover the full original Total Loan Amount.");
    if (!paidAccount && !installments.length) fail("At least one unpaid installment is required.");
    if (installments.length > 1000) fail("A loan cannot have more than 1000 unpaid installments.");
    const total = installments.reduce((sum, s) => sum + cents(s.amount_due) + cents(s.penalty_amount), 0);
    if (total !== cents(Number(values.outstanding_balance))) fail(`Outstanding Balance does not match the unpaid installments including unpaid penalties (${(total / 100).toFixed(2)}).`);
    if (errors.length === before) accounts.push({ rowNumber: row.rowNumber, values, installments,
      ...(paidAccount ? { settledSource: { count: seen.size, originalAmount: sourceAmount / 100 } } : {}) });
  }
  return { accounts, errors };
}
