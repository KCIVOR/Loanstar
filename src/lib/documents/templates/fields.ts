/**
 * Catalog of merge fields available to document templates, plus the sample
 * context used for editor preview rendering.
 *
 * This is authoring metadata: it powers the "Insert field" palette in the editor
 * and gives the live preview realistic values. The actual production data is
 * bound per-document when generation is wired in Phase 4 — the field KEYS here
 * are the contract those generators must satisfy.
 */

export type MergeField = {
  /** Token path used in templates, e.g. `borrowerName` or `checkNumber`. */
  key: string;
  /** Human label for the palette. */
  label: string;
  /** Example value shown in preview. */
  sample: string;
};

export type MergeCollection = {
  /** `data-repeat` key, e.g. `pdcSchedule`. */
  key: string;
  label: string;
  /** Item-scope fields available inside the repeated element. */
  fields: MergeField[];
};

export type FieldGroup = {
  label: string;
  fields: MergeField[];
};

/** Scalar fields, grouped for the palette. */
export const FIELD_GROUPS: FieldGroup[] = [
  {
    label: "Borrower",
    fields: [
      { key: "borrowerName", label: "Borrower name", sample: "Jonathan Hipolito Del Poso" },
      { key: "coBorrowerName", label: "Co-borrower name", sample: "" },
      { key: "borrowerNo", label: "Borrower no.", sample: "BN302754" },
      { key: "address", label: "Address", sample: "544 J. Buizon Street Brgy. Sto. Cristo, Baliwag, Bulacan 3006" },
      { key: "manningAgency", label: "Manning agency", sample: "Marlow Navigation Philippines Inc." },
      { key: "principalShip", label: "Principal / ship", sample: "Marlow Navigation Co. Ltd" },
    ],
  },
  {
    label: "Personal information",
    fields: [
      { key: "firstName", label: "First name", sample: "Jonathan" },
      { key: "middleName", label: "Middle name", sample: "Hipolito" },
      { key: "lastName", label: "Last name", sample: "Del Poso" },
      { key: "presentAddress", label: "Present address", sample: "544 J. Buizon Street Brgy. Sto. Cristo, Baliwag, Bulacan 3006" },
      { key: "presentLengthOfStay", label: "Present address — length of stay", sample: "5 years" },
      { key: "presentOwnership", label: "Present address — ownership", sample: "Owned" },
      { key: "presentMortgage", label: "Present address — mortgage", sample: "None" },
      { key: "permanentAddress", label: "Permanent address", sample: "544 J. Buizon Street Brgy. Sto. Cristo, Baliwag, Bulacan 3006" },
      { key: "permanentLengthOfStay", label: "Permanent address — length of stay", sample: "5 years" },
      { key: "permanentOwnership", label: "Permanent address — ownership", sample: "Owned" },
      { key: "permanentMortgage", label: "Permanent address — mortgage", sample: "None" },
      { key: "dateOfBirth", label: "Date of birth", sample: "05/14/1985" },
      { key: "civilStatus", label: "Civil status", sample: "Married" },
      { key: "placeOfBirth", label: "Place of birth", sample: "Baliwag, Bulacan" },
      { key: "mobileTelNumbers", label: "Mobile / tel. numbers", sample: "0917-123-4567" },
      { key: "email", label: "Email address", sample: "jonathan.delposo@example.com" },
      { key: "viber", label: "Viber", sample: "0917-123-4567" },
      { key: "skype", label: "Skype", sample: "" },
      { key: "othersContact", label: "Other contact", sample: "" },
      { key: "roaming", label: "Roaming number", sample: "" },
      { key: "facebook", label: "Facebook", sample: "jonathan.delposo" },
      { key: "education", label: "Education", sample: "College graduate" },
    ],
  },
  {
    label: "Manning agency (detail)",
    fields: [
      { key: "rank", label: "Rank", sample: "Able Seaman" },
      { key: "crewingManager", label: "Crewing manager", sample: "Maria Santos" },
      { key: "crewingManagerContact", label: "Crewing manager contact", sample: "0917-555-0100" },
      { key: "manningYearsOfStay", label: "Years of stay (manning agency)", sample: "3" },
      { key: "departureDate", label: "Departure date", sample: "01/15/2026" },
      { key: "prevManningAgency", label: "Previous manning agency", sample: "" },
      { key: "previousSignOffDate", label: "Previous sign-off date", sample: "" },
      { key: "reasonForTransfer", label: "Reason for transfer / years", sample: "" },
      { key: "contractDuration", label: "Contract duration", sample: "9 months" },
    ],
  },
  {
    label: "Financial",
    fields: [
      { key: "monthlyIncomeUsd", label: "Monthly income (USD)", sample: "1,200.00" },
      { key: "monthlyIncomePhp", label: "Monthly income (PHP)", sample: "67,200.00" },
      { key: "householdExpensesPhp", label: "Household expenses (PHP)", sample: "25,000.00" },
      { key: "otherLoansPhp", label: "Other loans (PHP)", sample: "0.00" },
    ],
  },
  {
    label: "Allottee / person in charge",
    fields: [
      { key: "allotteeName", label: "Allottee name", sample: "Maria Del Poso" },
      { key: "allotteeRelation", label: "Allottee relation", sample: "Spouse" },
      { key: "allotteeEmail", label: "Allottee email", sample: "" },
      { key: "allotteeAddress", label: "Allottee complete address", sample: "544 J. Buizon Street, Baliwag, Bulacan" },
      { key: "allotteeAllotmentPercent", label: "Allotment % / day", sample: "80%" },
      { key: "allotteeContact", label: "Allottee contact no.", sample: "0917-987-6543" },
      { key: "allotteeFacebook", label: "Allottee Facebook", sample: "" },
      { key: "allotteeCompanyName", label: "Allottee company name", sample: "" },
      { key: "allotteeCompanyAddress", label: "Allottee company address", sample: "" },
      { key: "allotteeYearsStayed", label: "Allottee years stayed (company)", sample: "" },
      { key: "allotteeCompanyPhone", label: "Allottee company phone", sample: "" },
    ],
  },
  {
    label: "Loan",
    fields: [
      { key: "loanAccountNo", label: "Loan account no.", sample: "LA303342" },
      { key: "loanType", label: "Loan type", sample: "RELOAN ONO SILVER" },
      { key: "loanAmount", label: "Loan amount", sample: "102,605.05" },
      { key: "terms", label: "Terms (months)", sample: "7" },
      { key: "addonMonths", label: "Add-on months", sample: "2" },
      { key: "interestRate", label: "Interest rate", sample: "2.10%" },
      { key: "totalInterest", label: "Total interest", sample: "19,392.36" },
      { key: "totalLoan", label: "Total loan", sample: "121,997.41" },
      { key: "monthlyAmortization", label: "Monthly amortization", sample: "17,428.20" },
      { key: "netLoanAmount", label: "Net loan amount", sample: "90,000.00" },
      { key: "amountInWords", label: "Amount in words", sample: "Ninety Thousand Pesos" },
      { key: "dateReleased", label: "Date released", sample: "06/11/2026" },
      { key: "firstPaymentDate", label: "First payment date", sample: "08/10/2026" },
      { key: "paymentEnds", label: "Payment ends", sample: "02/10/2027" },
    ],
  },
  {
    label: "Cheque / disbursement",
    fields: [
      { key: "checkVoucherNo", label: "Check voucher no.", sample: "CV303342" },
      { key: "bankName", label: "Bank name", sample: "EW - 2858" },
      { key: "bankAccountNo", label: "Bank account no.", sample: "200026352858" },
      { key: "checkNumber", label: "Check number", sample: "77250" },
      { key: "checkAmount", label: "Check amount", sample: "90,000.00" },
      { key: "checkDate", label: "Check date", sample: "06/11/2026" },
    ],
  },
  {
    label: "Company / signatories",
    fields: [
      { key: "companyName", label: "Company name", sample: "Loan Star Lending Group Corp." },
      { key: "todayDate", label: "Today's date", sample: "June 11, 2026" },
      { key: "preparedBy", label: "Prepared by", sample: "ABA" },
      { key: "checkedBy", label: "Checked by", sample: "" },
      { key: "approvedBy", label: "Approved by", sample: "KCC" },
    ],
  },
  {
    label: "Collection / demand",
    fields: [
      { key: "demandStage", label: "Demand stage", sample: "FINAL DEMAND" },
      { key: "outstandingBalance", label: "Outstanding balance", sample: "34,856.40" },
      { key: "penaltyAmount", label: "Penalty / charges", sample: "1,742.82" },
      { key: "totalAmountDue", label: "Total amount due", sample: "36,599.22" },
      { key: "daysPastDue", label: "Days past due", sample: "45" },
      { key: "dueDate", label: "Due date", sample: "05/26/2026" },
      { key: "paymentDeadline", label: "Payment deadline", sample: "07/26/2026" },
      { key: "amountReleased", label: "Amount released", sample: "90,000.00" },
    ],
  },
  {
    label: "Endorsement / application",
    fields: [
      { key: "endorsedTo", label: "Endorsed to", sample: "The Branch Manager, Main Office" },
      { key: "endorsementPurpose", label: "Endorsement purpose", sample: "records turnover and account monitoring" },
      { key: "applicationNo", label: "Application no.", sample: "APP303342" },
      { key: "applicationDate", label: "Application date", sample: "06/01/2026" },
    ],
  },
];

/** Repeating collections, for `data-repeat` rows. */
export const FIELD_COLLECTIONS: MergeCollection[] = [
  {
    key: "particulars",
    label: "Particulars / deductions",
    fields: [
      { key: "label", label: "Label", sample: "Processing Fee" },
      { key: "amount", label: "Amount", sample: "6,156.30" },
      { key: "accountCode", label: "Account code", sample: "5003010" },
    ],
  },
  {
    key: "pdcSchedule",
    label: "PDC schedule",
    fields: [
      { key: "checkDate", label: "Due date", sample: "08/10/26" },
      { key: "checkNumber", label: "Check number", sample: "102901" },
      { key: "amount", label: "Amount", sample: "17,428.20" },
      { key: "bankName", label: "Bank name", sample: "CHINABANK - LEGASPI VILL." },
      { key: "refAccount", label: "Ref account", sample: "1402-00-00488-0" },
    ],
  },
  {
    key: "accountingEntries",
    label: "Accounting entries (voucher)",
    fields: [
      { key: "description", label: "Account description", sample: "Loans Receivable - Seafarer Loan" },
      { key: "accountCode", label: "Account code", sample: "1100001" },
      { key: "debit", label: "Debit", sample: "102,605.05" },
      { key: "credit", label: "Credit", sample: "" },
    ],
  },
  {
    key: "computationRows",
    label: "Computation rows (original vs renegotiated)",
    fields: [
      { key: "label", label: "Particulars", sample: "Principal" },
      { key: "original", label: "Original", sample: "102,605.05" },
      { key: "renegotiated", label: "Renegotiated", sample: "110,000.00" },
    ],
  },
  {
    key: "dependents",
    label: "Dependents / siblings",
    fields: [
      { key: "name", label: "Name", sample: "Juan Del Poso" },
      { key: "age", label: "Age", sample: "12" },
      { key: "contactNo", label: "Tel / CP number", sample: "" },
      { key: "occupation", label: "Occupation / school", sample: "Grade 6" },
    ],
  },
  {
    key: "references",
    label: "Reference",
    fields: [
      { key: "name", label: "Name of reference", sample: "Pedro Cruz" },
      { key: "relationship", label: "Relation", sample: "Friend" },
      { key: "phone", label: "Contact no.", sample: "0917-000-1111" },
      { key: "occupation", label: "Occupation", sample: "Teacher" },
    ],
  },
];

/** Conditional flags usable with `data-if` / `data-unless`. */
export const FIELD_FLAGS: MergeField[] = [
  { key: "isCheck", label: "Released via check", sample: "true" },
  { key: "isCash", label: "Released via cash", sample: "" },
  { key: "hasCoBorrower", label: "Has co-borrower", sample: "" },
  { key: "isFinal", label: "Final demand (legal-action clause)", sample: "true" },
];

/** Build the sample render context from the catalog (drives preview). */
export function buildSampleContext(): Record<string, unknown> {
  const ctx: Record<string, unknown> = {};
  for (const group of FIELD_GROUPS) {
    for (const field of group.fields) ctx[field.key] = field.sample;
  }
  for (const flag of FIELD_FLAGS) {
    ctx[flag.key] = flag.sample === "true";
  }
  ctx.particulars = [
    { label: "Processing Fee", amount: "6,156.30", accountCode: "5003010" },
    { label: "Admin Cost", amount: "3,421.90", accountCode: "5003012" },
    { label: "Doc Stamp", amount: "769.54", accountCode: "5003014" },
    { label: "Security Fee", amount: "2,154.71", accountCode: "2100002" },
  ];
  ctx.pdcSchedule = Array.from({ length: 3 }, (_, i) => ({
    checkDate: `0${8 + i}/10/26`,
    checkNumber: `10290${i + 1}`,
    amount: "17,428.20",
    bankName: "CHINABANK - LEGASPI VILL.",
    refAccount: "1402-00-00488-0",
  }));
  ctx.accountingEntries = [
    { description: "Loans Receivable - Seafarer Loan", accountCode: "1100001", debit: "102,605.05", credit: "" },
    { description: "CASH", accountCode: "1100110", debit: "", credit: "90,000.00" },
  ];
  ctx.computationRows = [
    { label: "Principal", original: "102,605.05", renegotiated: "110,000.00" },
    { label: "Total Interest", original: "19,392.36", renegotiated: "23,100.00" },
    { label: "Total Loan", original: "121,997.41", renegotiated: "133,100.00" },
    { label: "Monthly Amortization", original: "17,428.20", renegotiated: "13,310.00" },
  ];
  ctx.dependents = [
    { name: "Juan Del Poso", age: "12", contactNo: "", occupation: "Grade 6" },
    { name: "Ana Del Poso", age: "9", contactNo: "", occupation: "Grade 3" },
  ];
  ctx.references = [
    { name: "Pedro Cruz", relationship: "Friend", phone: "0917-000-1111", occupation: "Teacher" },
    { name: "Liza Reyes", relationship: "Neighbor", phone: "0917-000-2222", occupation: "Nurse" },
  ];
  return ctx;
}
