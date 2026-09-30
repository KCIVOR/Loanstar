/**
 * Header → target auto-suggest. Pure; mapping is by column index because
 * the legacy files repeat headers (check blocks, vehicle/property blocks,
 * "Account Number", "Id Date", ...).
 */
import {
  type ColumnMapping,
  type LegacySegment,
  fieldsForSegment,
} from "./fields";

/** Case / punctuation / whitespace-insensitive header key. */
export function normalizeHeader(header: unknown): string {
  return String(header ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Alias → ordered target list. The nth occurrence of a header (outside a
 * check block) takes the nth target that is still unused. Covers the import
 * template (SF/SME tabs) and both calculator `Data` headers.
 */
const RAW_ALIASES: Record<string, readonly string[]> = {
  "Borrower Number": ["legacy_borrower_no"],
  "Legacy Borrower No.": ["legacy_borrower_no"],
  "Loan Number": ["legacy_loan_no"],
  "Legacy Loan No.": ["legacy_loan_no"],
  "Borrower's Name": ["full_name"],
  "Company / Borrower Name": ["full_name"],
  "Borrower Name": ["full_name"],
  "Full Name": ["full_name"],
  "First Name": ["first_name"],
  "Middle Name": ["middle_name"],
  "Last Name": ["last_name"],
  Suffix: ["suffix"],
  Email: ["email"],
  "Email Address": ["email"],
  Address: ["address"],
  Birthday: ["date_of_birth"],
  "Birthday (MM/DD/YYYY)": ["date_of_birth"],
  "Co-Borrower": ["co_borrower_name"],
  "Co-Borrower Name": ["co_borrower_name"],
  "Representative/Co-Borrower": ["co_borrower_name"],
  "Representative / Co-Borrower Name": ["co_borrower_name"],
  "Co-Borrower Address": ["co_borrower_address"],
  Position: ["representative_position"],
  "Representative Position": ["representative_position"],
  "Nature of Business": ["nature_of_business"],
  "Company Tin / Id": ["company_tin"],
  "Company TIN": ["company_tin"],
  "Company Name": ["manning_agency"],
  "Manning Agency / Company Name": ["manning_agency"],
  "Principal Ship": ["vessel_name"],
  "Vessel Name": ["vessel_name"],
  "Loan Entry Type": ["loan_entry_type"],
  "Loan Entry Type (Fresh/Reloan)": ["loan_entry_type"],
  "Borrower Type": ["borrower_type"],
  "Released Date": ["release_date"],
  "Payment Start": ["first_payment_date"],
  "Loan Desired": ["input_amount"],
  Terms: ["terms"],
  "Monthly Amort.": ["monthly_amortization"],
  "Interest Rate": ["interest_rate"],
  "Interest Rate (%)": ["interest_rate"],
  "Processing Fee Rate": ["pf_rate"],
  "Processing Fee Rate (%)": ["pf_rate"],
  "Admin Cost Rate": ["admin_rate"],
  "Admin Cost Rate (%)": ["admin_rate"],
  "Total Loan Amount": ["total_loan"],
  "Total Interest": ["total_interest"],
  "Principal Loan": ["principal"],
  "Total Deduction": ["total_deductions"],
  "Net Loan Amount": ["net_released"],
  "Processing Fee": ["processing_fee"],
  "Notary Fee": ["notary_fee"],
  "Other Loan": ["other_loan"],
  "Account Opening": ["account_opening"],
  "Security Fee": ["security_fee"],
  "Admin Cost": ["admin_cost"],
  "Documentary Stamp": ["doc_stamp"],
  "Previous Loan": ["previous_loan"],
  "Advance Payment": ["advance_payment"],
  "CM Fee": ["chattel_fee"],
  "CM Fee (Chattel Mortgage)": ["chattel_fee"],
  "Bank to be Released": ["bank_to_be_released"],
  "Account Number": ["account_number"],
  "Accout Number": ["account_number"],
  "Account Type": ["account_type"],
  "Bank Name": ["atm_bank_name"],
  "Surrender ATM / Bank Name": ["atm_bank_name"],
  "Card Number": ["atm_card_last4"],
  "ATM Card No. (last 4)": ["atm_card_last4"],
  "Check Number": ["check1_number", "check2_number"],
  "Check Account Number": ["check1_account", "check2_account"],
  "Check Amount": ["check1_amount", "check2_amount"],
  "Check Date": ["check1_date", "check2_date"],
  "Make / Year Model": ["vehicle1_make_year_model", "vehicle2_make_year_model", "vehicle3_make_year_model", "vehicle4_make_year_model"],
  "Make/Year/Model": ["vehicle1_make_year_model", "vehicle2_make_year_model", "vehicle3_make_year_model", "vehicle4_make_year_model"],
  "Engine No.": ["vehicle1_engine_no", "vehicle2_engine_no", "vehicle3_engine_no", "vehicle4_engine_no"],
  "Chassis No.": ["vehicle1_chassis_no", "vehicle2_chassis_no", "vehicle3_chassis_no", "vehicle4_chassis_no"],
  "Plate No.": ["vehicle1_plate_no", "vehicle2_plate_no", "vehicle3_plate_no", "vehicle4_plate_no"],
  "CR No.": ["vehicle1_cr_no", "vehicle2_cr_no", "vehicle3_cr_no", "vehicle4_cr_no"],
  "MV File No.": ["vehicle1_mv_file_no", "vehicle2_mv_file_no", "vehicle3_mv_file_no", "vehicle4_mv_file_no"],
  "Registered Owner": [
    "vehicle1_registered_owner", "vehicle2_registered_owner", "vehicle3_registered_owner", "vehicle4_registered_owner",
    "property1_registered_owner", "property2_registered_owner",
  ],
  "TCT / CCT No.": ["property1_tct_no", "property2_tct_no"],
  "Property Address": ["property1_address", "property2_address"],
  "Lot Area": ["property1_lot_area", "property2_lot_area"],
  "Technical Description": ["property1_technical_description", "property2_technical_description"],
};

export const HEADER_ALIASES: ReadonlyMap<string, readonly string[]> = new Map(
  Object.entries(RAW_ALIASES).map(([k, v]) => [normalizeHeader(k), v]),
);

/** Check block roles recognised after a "Bank / Branch" header. */
const BLOCK_ROLES: Record<string, "account" | "number" | "amount" | "date"> = {
  accountnumber: "account",
  checkaccountnumber: "account",
  checknumber: "number",
  amount: "amount",
  checkamount: "amount",
  checkdate: "date",
};

export function suggestMapping(
  headers: readonly unknown[],
  segment: LegacySegment,
): ColumnMapping[] {
  const allowed = new Set(fieldsForSegment(segment).map((f) => f.key));
  const labelIndex = new Map<string, string>();
  for (const f of fieldsForSegment(segment)) labelIndex.set(normalizeHeader(f.label), f.key);

  const norm = headers.map(normalizeHeader);
  const targets: (string | null)[] = headers.map(() => null);
  const used = new Set<string>();
  const assign = (i: number, key: string) => {
    if (!allowed.has(key) || used.has(key)) return false;
    targets[i] = key;
    used.add(key);
    return true;
  };

  // Pass 1: "Bank / Branch" check blocks (bank + following account/number/amount/date).
  let block = 0;
  for (let i = 0; i < norm.length; i++) {
    if (norm[i] !== "bankbranch" || block >= 2) continue;
    block += 1;
    assign(i, `check${block}_bank`);
    for (let j = i + 1; j < norm.length && j <= i + 4; j++) {
      const role = BLOCK_ROLES[norm[j]];
      if (!role || targets[j]) break;
      if (!assign(j, `check${block}_${role}`)) break;
    }
  }

  // Pass 2: aliases (occurrence order), then exact catalog label match.
  for (let i = 0; i < norm.length; i++) {
    if (targets[i] || !norm[i]) continue;
    const list = HEADER_ALIASES.get(norm[i]);
    if (list) {
      for (const key of list) if (assign(i, key)) break;
      continue;
    }
    const byLabel = labelIndex.get(norm[i]);
    if (byLabel) assign(i, byLabel);
  }

  return headers.map((h, index) => ({
    index,
    header: String(h ?? "").trim(),
    target: targets[index],
  }));
}
