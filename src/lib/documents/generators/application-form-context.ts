import type { BusinessInfo } from "@/lib/borrowers/business-info";
import type { BorrowerProfile } from "@/lib/borrowers/types";

import { COMPANY_NAME, formatDate, formatMoney, joinAddress } from "./shared";

export type ApplicationFormSegment = "seafarer" | "sme" | "individual";
export type ApplicationFormEntityType = "individual" | "corporate";

export type ApplicationFormSlug =
  | "application_form"
  | "application_form_sme_individual"
  | "application_form_sme_corporate";

export type ResolveApplicationFormSlugResult =
  | { ok: true; slug: ApplicationFormSlug }
  | { ok: false; error: string };

/**
 * Pick the published document_templates slug for an application-form printout.
 * Seafarer always uses the legacy slug. SME requires a valid entity_type —
 * never fall back to the Seafarer template (would print wrong labels).
 */
export function resolveApplicationFormSlug(input: {
  segment?: string | null;
  entityType?: string | null;
}): ResolveApplicationFormSlugResult {
  const segment =
    input.segment === "sme" || input.segment === "individual"
      ? input.segment
      : "seafarer";
  if (segment === "seafarer") {
    return { ok: true, slug: "application_form" };
  }
  if (segment === "individual") {
    // No Individual-segment application-form template exists yet (Phase 4/10
    // territory) — fail loudly rather than silently printing the Seafarer
    // template with wrong labels for a personal-loan applicant.
    return {
      ok: false,
      error:
        "No application form template exists yet for the Individual segment.",
    };
  }
  if (input.entityType === "individual") {
    return { ok: true, slug: "application_form_sme_individual" };
  }
  if (input.entityType === "corporate") {
    return { ok: true, slug: "application_form_sme_corporate" };
  }
  return {
    ok: false,
    error:
      "SME application is missing entity type (individual or corporate); cannot choose application form template.",
  };
}

export type ApplicationFormComputationSlice = {
  loanTypeName?: string | null;
  principal?: number | null;
  terms?: number | null;
  interestRate?: number | null;
} | null;

export type BuildApplicationFormContextInput = {
  segment?: string | null;
  entityType?: string | null;
  applicationNo?: string | null;
  applicationCreatedAt?: string | null;
  profile: BorrowerProfile;
  computation?: ApplicationFormComputationSlice;
};

function money(value: number | null | undefined): string {
  return value == null ? "" : formatMoney(value);
}

function str(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function mapOfficers(biz: BusinessInfo) {
  return (biz.companyOfficers ?? []).map((o) => ({
    name: str(o.name),
    address: str(o.address),
    position: str(o.position),
  }));
}

function mapStockholders(biz: BusinessInfo) {
  return (biz.majorStockholders ?? []).map((o) => ({
    name: str(o.name),
    address: str(o.address),
    position: str(o.position),
    equity: str(o.equity),
  }));
}

function mapTrade(parties: BusinessInfo["tradeCustomers"]) {
  return (parties ?? []).map((o) => ({
    name: str(o.name),
    address: str(o.address),
    contactPerson: str(o.contactPerson),
    contactNo: str(o.contactNo),
  }));
}

function mapCredit(biz: BusinessInfo) {
  return (biz.creditReferences ?? []).map((o) => ({
    creditorBank: str(o.creditorBank),
    typeOfLoan: str(o.typeOfLoan),
    outstandingBalance: str(o.outstandingBalance),
    monthlyPayment: str(o.monthlyPayment),
    contactNo: str(o.contactNo),
  }));
}

function mapBanks(biz: BusinessInfo) {
  return (biz.bankAccounts ?? []).map((o) => ({
    bankName: str(o.bankName),
    branch: str(o.branch),
    accountNo: str(o.accountNo),
    accountType: str(o.accountType),
    contactNo: str(o.contactNo),
  }));
}

/**
 * Merge context for the printable application form.
 *
 * Seafarer branch preserves the pre-existing key set / values (including
 * manning + allottee). SME branch does **not** remap business fields into
 * manningAgency/allottee — those stay blank; SME templates use dedicated keys.
 */
export function buildApplicationFormContext(
  input: BuildApplicationFormContextInput,
): Record<string, unknown> {
  const borrower = input.profile;
  const computation = input.computation ?? null;
  const isSme = input.segment === "sme";
  const biz = borrower.businessInfo ?? {};
  const spouse = biz.spouse ?? {};
  const profileData = borrower.profileData ?? {};

  const businessCompanyName = str(biz.companyName);
  const businessNature = str(biz.natureOfBusiness);
  const businessAddress = str(biz.officeAddress ?? biz.companyAddress);

  const base: Record<string, unknown> = {
    companyName: COMPANY_NAME,
    applicationNo: str(input.applicationNo),
    applicationDate: formatDate(input.applicationCreatedAt ?? null),
    borrowerName: [borrower.firstName, borrower.lastName].filter(Boolean).join(" "),
    coBorrowerName: "",
    borrowerNo: borrower.borrowerNo,
    address: joinAddress(borrower.presentAddress),
    loanType: computation?.loanTypeName ?? "",
    loanAmount: computation?.principal != null ? formatMoney(computation.principal) : "",
    terms: computation?.terms != null ? String(computation.terms) : "",
    interestRate:
      computation?.interestRate != null
        ? `${(computation.interestRate * 100).toFixed(2)}%`
        : "",

    firstName: borrower.firstName ?? "",
    middleName: borrower.middleName ?? "",
    lastName: borrower.lastName ?? "",
    presentAddress: joinAddress(borrower.presentAddress),
    presentLengthOfStay: borrower.presentAddress?.lengthOfStay ?? "",
    presentOwnership: borrower.presentAddress?.ownership ?? "",
    presentMortgage: borrower.presentAddress?.mortgage ?? "",
    permanentAddress: joinAddress(borrower.permanentAddress),
    permanentLengthOfStay: borrower.permanentAddress?.lengthOfStay ?? "",
    permanentOwnership: borrower.permanentAddress?.ownership ?? "",
    permanentMortgage: borrower.permanentAddress?.mortgage ?? "",
    dateOfBirth: formatDate(borrower.dateOfBirth),
    civilStatus: borrower.civilStatus ?? "",
    placeOfBirth: borrower.placeOfBirth ?? "",
    mobileTelNumbers: [borrower.mobilePhone, borrower.landline]
      .filter(Boolean)
      .join(" / "),
    landline: borrower.landline ?? "",
    mobileNumber: borrower.mobilePhone ?? "",
    email: borrower.email ?? "",
    viber: str(profileData.viber),
    teams: str(profileData.teams),
    othersContact: str(profileData.othersContact),
    roaming: str(profileData.roaming),
    facebook: str(profileData.facebook),
    education: str(profileData.education),
    noOfDependents: String((borrower.dependents ?? []).length || str(profileData.noOfDependents)),

    dependents: (borrower.dependents ?? []).map((d) => ({
      name: d.name ?? "",
      age: d.age ?? "",
      contactNo: d.contactNo ?? "",
      occupation: d.occupation ?? "",
    })),
    references: (borrower.references ?? []).map((r) => ({
      name: r.name ?? "",
      relationship: r.relationship ?? "",
      phone: r.phone ?? "",
      occupation: r.occupation ?? "",
      address: r.address ?? "",
    })),
  };

  if (!isSme) {
    return {
      ...base,
      manningAgency: borrower.manningAgency?.name ?? "",
      principalShip: borrower.picWork?.vessel ?? "",
      rank: borrower.picWork?.rank ?? "",
      crewingManager: borrower.manningAgency?.crewingManager ?? "",
      crewingManagerContact: borrower.manningAgency?.crewingManagerContact ?? "",
      manningYearsOfStay: borrower.manningAgency?.yearsOfStay ?? "",
      departureDate: borrower.manningAgency?.departureDate ?? "",
      prevManningAgency: borrower.manningAgency?.previousAgency ?? "",
      previousSignOffDate: borrower.manningAgency?.previousSignOffDate ?? "",
      reasonForTransfer: borrower.manningAgency?.reasonForTransfer ?? "",
      contractDuration: borrower.picWork?.contractDuration ?? "",
      monthlyIncomeUsd: money(borrower.financial?.monthlyIncomeUsd),
      monthlyIncomePhp: money(borrower.financial?.monthlyIncomePhp),
      householdExpensesPhp: money(borrower.financial?.householdExpensesPhp),
      otherLoansPhp: money(borrower.financial?.otherLoansPhp),
      allotteeName: borrower.allottee?.name ?? "",
      allotteeRelation: borrower.allottee?.relationship ?? "",
      allotteeEmail: borrower.allottee?.email ?? "",
      allotteeAddress: joinAddress(borrower.allottee?.address),
      allotteeAllotmentPercent: borrower.allottee?.allotmentPercent ?? "",
      allotteeContact: borrower.allottee?.phone ?? "",
      allotteeFacebook: borrower.allottee?.facebook ?? "",
      allotteeCompanyName: borrower.allottee?.companyName ?? "",
      allotteeCompanyAddress: borrower.allottee?.companyAddress ?? "",
      allotteeYearsStayed: borrower.allottee?.yearsStayed ?? "",
      allotteeCompanyPhone: borrower.allottee?.companyPhone ?? "",
    };
  }

  // SME: dedicated keys only — do not fill Seafarer manning/allottee slots.
  return {
    ...base,
    isSme: true,
    isSeafarer: false,
    manningAgency: "",
    principalShip: "",
    rank: "",
    crewingManager: "",
    crewingManagerContact: "",
    manningYearsOfStay: "",
    departureDate: "",
    prevManningAgency: "",
    previousSignOffDate: "",
    reasonForTransfer: "",
    contractDuration: "",
    monthlyIncomeUsd: "",
    monthlyIncomePhp: "",
    householdExpensesPhp: "",
    otherLoansPhp: "",
    allotteeName: "",
    allotteeRelation: "",
    allotteeEmail: "",
    allotteeAddress: "",
    allotteeAllotmentPercent: "",
    allotteeContact: "",
    allotteeFacebook: "",
    allotteeCompanyName: "",
    allotteeCompanyAddress: "",
    allotteeYearsStayed: "",
    allotteeCompanyPhone: "",

    dateApplied: str(biz.dateApplied) || formatDate(input.applicationCreatedAt ?? null),
    typeOfLoan: str(profileData.typeOfLoan) || "Business Loan",
    loanDesired:
      str(profileData.loanDesired) ||
      (computation?.principal != null ? formatMoney(computation.principal) : ""),
    salesAgent: str(biz.salesAgent),

    businessCompanyName,
    businessAcronym: str(biz.acronym),
    businessNature,
    businessAddress,
    businessLandline: str(biz.landlineNos),
    businessMobile: str(biz.mobileNos),
    businessFax: str(biz.faxNo),
    businessBranches: str(biz.numberOfBranches),
    businessDateEstablished: str(biz.dateEstablished),
    businessEmail: str(biz.companyEmail),
    businessEmployees: str(biz.numberOfEmployees),
    businessTin: str(biz.tin),
    businessWebsite: str(biz.website),
    businessPosition: str(biz.position),
    businessYearsOfStay: str(biz.yearsOfStay),
    businessYearsOfOperation: str(biz.yearsOfOperation),
    businessContactNumber: str(biz.companyContactNumber),
    previousEmployer: str(biz.previousEmployer),
    previousCompanyAddress: str(biz.previousCompanyAddress),
    previousYearsOfStay: str(biz.previousYearsOfStay),
    previousContactNumber: str(biz.previousContactNumber),
    bankAuthorizationAccount: str(biz.bankAuthorizationAccount),

    relativesLivingInProvince: str(profileData.relativesLivingInProvince),
    relativesLivingInProvinceAddress: str(
      profileData.relativesLivingInProvinceAddress,
    ),
    relativesLivingInProvinceContact: str(
      profileData.relativesLivingInProvinceContact,
    ),

    ownGrossIncome: str(biz.businessGrossIncome),
    ownLessExpenses: str(biz.businessLessExpenses),
    ownNetIncome: str(biz.businessNetIncome ?? biz.ownMonthlyIncome),
    spouseGrossIncome: str(biz.spouseGrossIncome ?? biz.spouseMonthlyIncome),
    spouseLessExpenses: str(biz.spouseLessExpenses),
    spouseNetIncome: str(biz.spouseNetIncome ?? biz.spouseMonthlyIncome),
    otherIncomeSource: str(biz.sourceOfIncome),
    otherMonthlyIncome: str(biz.otherIncome),
    totalNetIncome: str(biz.totalNetIncome),

    spouseLastName: str(spouse.lastName),
    spouseFirstName: str(spouse.firstName),
    spouseMiddleName: str(spouse.middleName),
    spouseDateOfBirth: str(spouse.dateOfBirth),
    spousePresentAddress: str(spouse.presentAddress),
    spouseYearsOfStayPresent: str(spouse.yearsOfStayPresent),
    spouseProvincialAddress: str(spouse.provincialAddress),
    spouseYearsOfStayProvincial: str(spouse.yearsOfStayProvincial),
    spouseCompanyName: str(spouse.companyOrEmployerName),
    spouseYearsOfStayCompany: str(spouse.yearsOfStayCompany),
    spousePosition: str(spouse.position),
    spouseContactNumber: str(spouse.contactNumber),
    spouseCompanyAddress: str(spouse.companyAddress),

    companyOfficers: mapOfficers(biz),
    majorStockholders: mapStockholders(biz),
    tradeCustomers: mapTrade(biz.tradeCustomers),
    tradeSuppliers: mapTrade(biz.tradeSuppliers),
    creditReferences: mapCredit(biz),
    bankAccounts: mapBanks(biz),
  };
}
