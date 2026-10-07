/**
 * Legacy data import — target field catalog (dry-run validation only).
 *
 * Source of truth: docs/revision-plans/legacy-data-import-audit-sf-sme.md.
 * Every `target` below is a column / jsonb path that exists in the live
 * schema today. Nothing here creates new borrower/loan columns.
 *
 * `required` = the live DB column is NOT NULL (no default) for a row an
 * import would create. `requiredGroup` lets several targets jointly satisfy
 * one requirement (e.g. full name OR first+last name).
 */

export type LegacySegment = "seafarer" | "sme" | "individual";

export const LEGACY_SEGMENTS: readonly LegacySegment[] = ["seafarer", "sme", "individual"];

export type LegacyFieldType =
  | "text"
  | "number"
  | "integer"
  | "date"
  | "boolean"
  | "enum";

export type LegacyEnumKind = "loan_entry_type" | "borrower_type";

export type LegacyField = {
  key: string;
  label: string;
  /** table.column or table.jsonb.path in the live schema. */
  target: string;
  type: LegacyFieldType;
  enumKind?: LegacyEnumKind;
  required?: boolean;
  /**
   * Required-but-not-gating: the DB needs it, but no legacy file carries it,
   * so a missing column only produces a per-row warning (a policy decision
   * is needed before a real import).
   */
  requiredPolicy?: "warn";
  /** Check block this field belongs to (pdc_checks rows). */
  checkBlock?: 1 | 2;
  segments: readonly LegacySegment[];
};

const BOTH: readonly LegacySegment[] = ["seafarer", "sme", "individual"];
const SF: readonly LegacySegment[] = ["seafarer"];
const SME: readonly LegacySegment[] = ["sme"];

function checkFields(n: 1 | 2): LegacyField[] {
  const p = `pdc_checks[${n - 1}]`;
  return [
    { key: `check${n}_number`, label: `Check ${n} — Check Number`, target: `${p}.check_number`, type: "text", checkBlock: n, segments: BOTH },
    { key: `check${n}_bank`, label: `Check ${n} — Bank / Branch`, target: `${p}.bank_name`, type: "text", checkBlock: n, segments: BOTH },
    { key: `check${n}_account`, label: `Check ${n} — Account Number`, target: `${p}.ref_account`, type: "text", checkBlock: n, segments: BOTH },
    { key: `check${n}_amount`, label: `Check ${n} — Amount`, target: `${p}.amount`, type: "number", checkBlock: n, segments: BOTH },
    { key: `check${n}_date`, label: `Check ${n} — Check Date`, target: `${p}.check_date`, type: "date", checkBlock: n, segments: BOTH },
  ];
}

function vehicleFields(n: number): LegacyField[] {
  const p = `verifications.cm_inspection.vehicles[${n - 1}]`;
  return [
    { key: `vehicle${n}_make_year_model`, label: `Vehicle ${n} — Make / Year Model`, target: `${p}.makeYearModel`, type: "text", segments: SME },
    { key: `vehicle${n}_engine_no`, label: `Vehicle ${n} — Engine No.`, target: `${p}.engineNo`, type: "text", segments: SME },
    { key: `vehicle${n}_chassis_no`, label: `Vehicle ${n} — Chassis No.`, target: `${p}.chasisNo`, type: "text", segments: SME },
    { key: `vehicle${n}_plate_no`, label: `Vehicle ${n} — Plate No.`, target: `${p}.orCrDetails.plateNumber`, type: "text", segments: SME },
    { key: `vehicle${n}_cr_no`, label: `Vehicle ${n} — CR No.`, target: `${p}.crNo`, type: "text", segments: SME },
    { key: `vehicle${n}_mv_file_no`, label: `Vehicle ${n} — MV File No.`, target: `${p}.mvFile`, type: "text", segments: SME },
    { key: `vehicle${n}_registered_owner`, label: `Vehicle ${n} — Registered Owner`, target: `${p}.registration.registeredOwner`, type: "text", segments: SME },
  ];
}

function propertyFields(n: number): LegacyField[] {
  const p = `verifications.rem_inspection.properties[${n - 1}]`;
  return [
    { key: `property${n}_registered_owner`, label: `Property ${n} — Registered Owner`, target: `${p}.titleDetails.registeredOwnerAtTitle`, type: "text", segments: SME },
    { key: `property${n}_tct_no`, label: `Property ${n} — TCT / CCT No.`, target: `${p}.legalDescription.tctNo`, type: "text", segments: SME },
    { key: `property${n}_address`, label: `Property ${n} — Property Address`, target: `${p}.legalDescription.location`, type: "text", segments: SME },
    { key: `property${n}_lot_area`, label: `Property ${n} — Lot Area (sqm)`, target: `${p}.legalDescription.areaSqm`, type: "number", segments: SME },
    { key: `property${n}_technical_description`, label: `Property ${n} — Technical Description`, target: `${p}.legalDescription.technicalDescription`, type: "text", segments: SME },
  ];
}

export const LEGACY_FIELDS: readonly LegacyField[] = [
  { key: "outstanding_balance", label: "Outstanding Balance", target: "masterlist.outstanding_balance", type: "number", segments: BOTH },
  { key: "balance_as_of", label: "Balance As Of", target: "legacy import snapshot date", type: "date", segments: BOTH },
  { key: "mobile_phone", label: "Mobile Phone", target: "borrowers.mobile_phone", type: "text", segments: BOTH },
  { key: "loan_type_name", label: "Loan Type Name", target: "computations.loan_type_name", type: "text", segments: BOTH },
  { key: "payment_frequency", label: "Payment Frequency", target: "computations.payment_frequency", type: "text", segments: BOTH },
  { key: "payment_schedule", label: "Payment Schedule", target: "loan_applications.payment_schedule", type: "text", segments: BOTH },
  { key: "schedule_type", label: "Schedule Type", target: "loan_applications.schedule_type", type: "text", segments: BOTH },
  { key: "due_day", label: "Due Day", target: "computations.due_day", type: "integer", segments: BOTH },
  { key: "security_fee_rate", label: "Security Fee Rate", target: "computations.security_fee_rate", type: "number", segments: BOTH },
  { key: "other_deductions_total", label: "Other Deductions Total", target: "computations.other_deductions_total", type: "number", segments: BOTH },
  { key: "account_status", label: "Account Status", target: "masterlist.account_status", type: "text", segments: BOTH },
  { key: "closed_at", label: "Closed At", target: "masterlist.closed_at (paid accounts only)", type: "date", segments: BOTH },
  { key: "business_name", label: "Business Name", target: "borrowers.business_info.companyName", type: "text", segments: SME },
  { key: "entity_type", label: "Entity Type", target: "loan_applications.entity_type", type: "text", segments: SME },
  { key: "individual_loan_type", label: "Individual Loan Type", target: "loan_applications.individual_loan_type", type: "text", segments: ["individual"] },
  // Identity / keys
  { key: "legacy_borrower_no", label: "Legacy Borrower No.", target: "borrowers.borrower_no", type: "text", segments: BOTH },
  { key: "legacy_loan_no", label: "Legacy Loan No.", target: "loan_applications.application_no / masterlist.loan_account_no", type: "text", segments: BOTH },
  { key: "full_name", label: "Borrower Full Name (split into first/last)", target: "borrowers.first_name + borrowers.last_name", type: "text", segments: BOTH },
  { key: "first_name", label: "First Name", target: "borrowers.first_name", type: "text", segments: BOTH },
  { key: "middle_name", label: "Middle Name", target: "borrowers.middle_name", type: "text", segments: BOTH },
  { key: "last_name", label: "Last Name", target: "borrowers.last_name", type: "text", segments: BOTH },
  { key: "suffix", label: "Suffix", target: "borrowers.suffix", type: "text", segments: BOTH },
  { key: "email", label: "Email", target: "borrowers.email", type: "text", required: true, requiredPolicy: "warn", segments: BOTH },
  { key: "address", label: "Address (single line)", target: "borrowers.present_address", type: "text", segments: BOTH },
  { key: "date_of_birth", label: "Birthday", target: "borrowers.date_of_birth", type: "date", segments: BOTH },
  { key: "co_borrower_name", label: "Co-Borrower / Representative Name", target: "loan_applications.co_borrowers[0].fullName", type: "text", segments: BOTH },
  { key: "co_borrower_address", label: "Co-Borrower Address", target: "loan_applications.co_borrowers[0].address", type: "text", segments: SME },
  { key: "representative_position", label: "Representative Position", target: "borrowers.business_info.companyOfficers[0].position", type: "text", segments: SME },
  { key: "nature_of_business", label: "Nature of Business", target: "borrowers.business_info.natureOfBusiness", type: "text", segments: SME },
  { key: "company_tin", label: "Company TIN", target: "borrowers.business_info.tin", type: "text", segments: SME },
  { key: "manning_agency", label: "Manning Agency / Company Name", target: "borrowers.manning_agency.name", type: "text", segments: SF },
  { key: "vessel_name", label: "Vessel Name (Principal Ship)", target: "masterlist.vessel_name", type: "text", segments: SF },
  { key: "loan_entry_type", label: "Loan Entry Type (Fresh/Reloan)", target: "loan_applications.is_reloan", type: "enum", enumKind: "loan_entry_type", segments: BOTH },
  { key: "borrower_type", label: "Borrower Type", target: "loan_applications.segment", type: "enum", enumKind: "borrower_type", segments: BOTH },

  // Computation
  { key: "release_date", label: "Released Date", target: "computations.release_date", type: "date", segments: BOTH },
  { key: "first_payment_date", label: "Payment Start", target: "computations.first_payment_date", type: "date", segments: BOTH },
  { key: "input_amount", label: "Loan Desired", target: "computations.input_amount", type: "number", required: true, segments: BOTH },
  { key: "terms", label: "Terms", target: "computations.terms", type: "integer", required: true, segments: BOTH },
  { key: "monthly_amortization", label: "Monthly Amort.", target: "computations.monthly_amortization", type: "number", required: true, segments: BOTH },
  { key: "interest_rate", label: "Interest Rate (%)", target: "computations.interest_rate", type: "number", required: true, segments: BOTH },
  { key: "pf_rate", label: "Processing Fee Rate (%)", target: "computations.pf_rate", type: "number", required: true, segments: BOTH },
  { key: "admin_rate", label: "Admin Cost Rate (%)", target: "computations.admin_rate", type: "number", segments: BOTH },
  { key: "principal", label: "Principal Loan", target: "computations.principal", type: "number", required: true, segments: BOTH },
  { key: "total_loan", label: "Total Loan Amount", target: "computations.total_loan", type: "number", required: true, segments: BOTH },
  { key: "total_interest", label: "Total Interest", target: "computations.total_interest", type: "number", required: true, segments: BOTH },
  { key: "net_released", label: "Net Loan Amount", target: "computations.net_released", type: "number", required: true, segments: BOTH },
  { key: "processing_fee", label: "Processing Fee", target: "computations.processing_fee", type: "number", required: true, segments: BOTH },
  { key: "notary_fee", label: "Notary Fee", target: "computations.notary_fee", type: "number", required: true, segments: BOTH },
  { key: "security_fee", label: "Security Fee", target: "computations.security_fee", type: "number", required: true, segments: BOTH },
  { key: "admin_cost", label: "Admin Cost", target: "computations.admin_cost", type: "number", required: true, segments: BOTH },
  { key: "doc_stamp", label: "Documentary Stamp", target: "computations.doc_stamp", type: "number", required: true, segments: BOTH },
  { key: "total_deductions", label: "Total Deduction", target: "computations.total_deductions", type: "number", required: true, segments: BOTH },
  { key: "chattel_fee", label: "CM Fee (Chattel Mortgage)", target: "computations.chattel_fee", type: "number", segments: SME },
  { key: "other_loan", label: "Other Loan", target: "computations.other_deductions.otherLoan", type: "number", segments: BOTH },
  { key: "account_opening", label: "Account Opening", target: "computations.other_deductions.accountOpening", type: "number", segments: BOTH },
  { key: "previous_loan", label: "Previous Loan", target: "computations.other_deductions.previousLoanBalance", type: "number", segments: BOTH },
  { key: "advance_payment", label: "Advance Payment", target: "computations.other_deductions.advancePayment", type: "number", segments: BOTH },

  // Bank / ATM
  { key: "bank_to_be_released", label: "Bank to be Released", target: "borrowers.financial.bankName", type: "text", segments: BOTH },
  { key: "account_number", label: "Account Number", target: "borrowers.financial.accountNumber", type: "text", segments: BOTH },
  { key: "account_type", label: "Account Type", target: "borrowers.financial.accountType", type: "text", segments: BOTH },
  { key: "atm_bank_name", label: "ATM Bank Name", target: "masterlist.atm_bank_name", type: "text", segments: BOTH },
  { key: "atm_card_last4", label: "ATM Card No. (last 4 kept)", target: "masterlist.atm_card_last4", type: "text", segments: BOTH },

  ...checkFields(1),
  ...checkFields(2),
  ...vehicleFields(1),
  ...vehicleFields(2),
  ...vehicleFields(3),
  ...vehicleFields(4),
  ...propertyFields(1),
  ...propertyFields(2),
];

export const FIELD_BY_KEY: ReadonlyMap<string, LegacyField> = new Map(
  LEGACY_FIELDS.map((f) => [f.key, f]),
);

export function fieldsForSegment(segment: LegacySegment): LegacyField[] {
  return LEGACY_FIELDS.filter((f) => f.segments.includes(segment));
}

/** One column → target mapping entry (persisted as jsonb in presets/runs). */
export type ColumnMapping = {
  index: number;
  header: string;
  /** Target field key, or null = Ignore. */
  target: string | null;
};

export type RequirementStatus = {
  label: string;
  covered: boolean;
  /** true → blocks "Validate" when uncovered. */
  gating: boolean;
};

/** Required-field coverage for a mapping (drives the Validate gate). */
export function requiredCoverage(
  mapping: readonly ColumnMapping[],
  segment: LegacySegment,
): RequirementStatus[] {
  const mapped = new Set(mapping.map((m) => m.target).filter(Boolean) as string[]);
  const out: RequirementStatus[] = [
    {
      label: "Borrower name (Full Name, or First Name + Last Name)",
      covered: mapped.has("full_name") || (mapped.has("first_name") && mapped.has("last_name")),
      gating: true,
    },
  ];
  for (const f of fieldsForSegment(segment)) {
    if (!f.required) continue;
    out.push({ label: f.label, covered: mapped.has(f.key), gating: f.requiredPolicy !== "warn" });
  }
  // pdc_checks: when any part of a check block is mapped, date/amount/bank become required.
  for (const n of [1, 2] as const) {
    const blockMapped = [...mapped].some((k) => FIELD_BY_KEY.get(k)?.checkBlock === n);
    if (!blockMapped) continue;
    for (const part of ["date", "amount", "bank"] as const) {
      const key = `check${n}_${part}`;
      out.push({ label: FIELD_BY_KEY.get(key)!.label, covered: mapped.has(key), gating: true });
    }
  }
  return out;
}

export function duplicateTargets(mapping: readonly ColumnMapping[]): string[] {
  const seen = new Map<string, number>();
  for (const m of mapping) {
    if (!m.target) continue;
    seen.set(m.target, (seen.get(m.target) ?? 0) + 1);
  }
  return [...seen].filter(([, n]) => n > 1).map(([k]) => k);
}

export function canValidate(mapping: readonly ColumnMapping[], segment: LegacySegment): boolean {
  return (
    duplicateTargets(mapping).length === 0 &&
    requiredCoverage(mapping, segment).every((r) => r.covered || !r.gating)
  );
}
