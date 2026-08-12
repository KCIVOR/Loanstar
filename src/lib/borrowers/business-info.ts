/**
 * SME `borrowers.business_info` JSONB shape.
 *
 * Source (extracted 2026-08-07 from client PDFs):
 * - Individual Application Form LSLG v.4.pdf
 * - Business Application LSLG v.4.pdf (Corporate)
 *
 * Loose-JSONB convention matches manning_agency / allottee / pic_work.
 * Personal identity fields stay on borrower columns; this object holds
 * business / company / spouse-income blocks from those forms.
 */

export type BusinessOfficer = {
  name?: string;
  address?: string;
  position?: string;
};

export type BusinessStockholder = {
  name?: string;
  address?: string;
  position?: string;
  equity?: string;
};

export type TradeParty = {
  name?: string;
  address?: string;
  contactPerson?: string;
  contactNo?: string;
};

export type CreditReference = {
  creditorBank?: string;
  typeOfLoan?: string;
  monthlyPayment?: string;
  outstandingBalance?: string;
  contactNo?: string;
};

export type BusinessBankAccount = {
  bankName?: string;
  branch?: string;
  accountNo?: string;
  accountType?: string;
  contactNo?: string;
};

export type SmeSpouseInfo = {
  lastName?: string;
  firstName?: string;
  middleName?: string;
  dateOfBirth?: string;
  presentAddress?: string;
  yearsOfStayPresent?: string;
  provincialAddress?: string;
  yearsOfStayProvincial?: string;
  companyOrEmployerName?: string;
  yearsOfStayCompany?: string;
  position?: string;
  contactNumber?: string;
  companyAddress?: string;
};

/** Fields from both Individual and Corporate SME application forms. */
export type BusinessInfo = {
  // Header (both forms)
  dateApplied?: string;
  salesAgent?: string;

  // Identity of the business (Individual: company/employer; Corporate: company)
  /** Prefer this key for duplication checks (Phase 7) and display. */
  companyName?: string;
  acronym?: string;
  companyAddress?: string;
  officeAddress?: string;
  landlineNos?: string;
  mobileNos?: string;
  natureOfBusiness?: string;
  faxNo?: string;
  numberOfBranches?: string;
  /** Form label typo "Date Establised" — stored under corrected key. */
  dateEstablished?: string;
  companyEmail?: string;
  numberOfEmployees?: string;
  tin?: string;
  website?: string;

  // Individual self-employed / business employment block
  position?: string;
  yearsOfStay?: string;
  yearsOfOperation?: string;
  companyContactNumber?: string;
  previousEmployer?: string;
  previousCompanyAddress?: string;
  previousYearsOfStay?: string;
  previousContactNumber?: string;

  // Individual income declaration (business) — Form A three-column block
  businessGrossIncome?: string;
  businessLessExpenses?: string;
  businessNetIncome?: string;
  ownMonthlyIncome?: string;
  /** @deprecated Prefer spouseGrossIncome / spouseNetIncome; kept for older payloads. */
  spouseMonthlyIncome?: string;
  spouseGrossIncome?: string;
  spouseLessExpenses?: string;
  spouseNetIncome?: string;
  otherIncome?: string;
  sourceOfIncome?: string;
  totalNetIncome?: string;

  spouse?: SmeSpouseInfo;

  // Corporate repeating sections
  companyOfficers?: BusinessOfficer[];
  majorStockholders?: BusinessStockholder[];
  tradeCustomers?: TradeParty[];
  tradeSuppliers?: TradeParty[];
  creditReferences?: CreditReference[];
  bankAccounts?: BusinessBankAccount[];
  bankAuthorizationAccount?: string;
};

export function emptyBusinessInfo(): BusinessInfo {
  return {};
}

export function parseBusinessInfo(raw: unknown): BusinessInfo {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return emptyBusinessInfo();
  }
  return raw as BusinessInfo;
}
