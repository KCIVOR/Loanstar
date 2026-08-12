import { halfUp, sumHalfUp } from "@/lib/computation/money";

/**
 * Single shared residence-type list (Phase 6.0.d.5).
 * UI labels use corrected spelling; form had "Apart ment".
 */
export const RESIDENCE_TYPES = [
  { id: "bungalow", label: "Bungalow" },
  { id: "town_house", label: "Town house" },
  { id: "condominium", label: "Condominium" },
  { id: "tenement", label: "Tenement" },
  { id: "two_storey", label: "2-Storey" },
  { id: "apartment", label: "Apartment" },
  { id: "mansion", label: "Mansion" },
  { id: "others", label: "Others" },
] as const;

export type ResidenceTypeId = (typeof RESIDENCE_TYPES)[number]["id"];

export type NeighborhoodClass = "low" | "middle" | "upper";
export type NeighborhoodQuality = "poor" | "fair" | "good";

export type NeighborhoodArea = {
  class?: NeighborhoodClass | null;
  quality?: NeighborhoodQuality | null;
};

export type NeighborhoodGrid = {
  residential?: NeighborhoodArea | null;
  commercial?: NeighborhoodArea | null;
  mixed?: NeighborhoodArea | null;
};

export type FieldVisitInformant = {
  name?: string | null;
  address?: string | null;
};

export type MortgageDetail = {
  flag?: boolean | null;
  toWhom?: string | null;
  monthlyAmort?: number | null;
  yearsToPay?: number | null;
  monthsLeft?: number | null;
};

export type FieldVisitHeader = {
  dateRequested?: string | null;
  dateVisited?: string | null;
  requestedBy?: string | null;
  visitedBy?: string | null;
  clientName?: string | null;
  /** Header address — also used as "Address Provided" (6.0.d.2). */
  clientAddress?: string | null;
  companyName?: string | null;
  companyAddress?: string | null;
};

export type FieldVisitResidence = {
  availability?: { date?: string | null; time?: string | null } | null;
  yearOfStay?: number | null;
  floorAreaSqm?: number | null;
  provincialResidence?: string | null;
  provincialYearsOfStay?: number | null;
  ownedBy?: string | null;
  // W18:Y18 omitted from v1 (6.0.d.1)
  previousAddress?: string | null;
  previousYearsOfStay?: number | null;
  residenceType?: ResidenceTypeId | null;
  landlordName?: string | null;
  neighborhood?: NeighborhoodGrid | null;
  findingsReport?: string | null;
  adverseFindingsClient?: string | null;
  adverseFindingsArea?: string | null;
  informants?: FieldVisitInformant[] | null;
  expenses?: {
    propertyMortgage?: MortgageDetail | null;
    vehicles?: {
      flag?: boolean | null;
      howMany?: number | null;
      kindModel?: string | null;
    } | null;
    vehicleMortgage?: MortgageDetail | null;
    householdCount?: number | null;
    maidCount?: number | null;
    maidSalary?: number | null;
    electricity?: number | null;
    water?: number | null;
    internet?: number | null;
    food?: number | null;
    school?: number | null;
  } | null;
  otherRemarks?: string | null;
};

export type FieldVisitBusiness = {
  availability?: { date?: string | null; time?: string | null } | null;
  yearOfStay?: number | null;
  floorAreaSqm?: number | null;
  rented?: { landlordName?: string | null; telephone?: string | null } | null;
  previousAddress?: string | null;
  previousYearsOfStay?: number | null;
  reasonOfTransfer?: string | null;
  neighborhood?: NeighborhoodGrid | null;
  findingsReport?: string | null;
  otherOffices?: {
    branch?: boolean | null;
    warehouse?: boolean | null;
    address?: string | null;
    yearOfStay?: number | null;
    rented?: { landlordName?: string | null; telephone?: string | null } | null;
    floorAreaSqm?: number | null;
    neighborhood?: NeighborhoodGrid | null;
    findingsReport?: string | null;
  } | null;
  adverseFindingsClient?: string | null;
  adverseFindingsArea?: string | null;
  informants?: FieldVisitInformant[] | null;
  adjudication?: {
    stocks?: {
      flag?: boolean | null;
      howMany?: number | null;
      estimatedAmount?: number | null;
    } | null;
    employees?: {
      flag?: boolean | null;
      howMany?: number | null;
      totalSalaryPerMonth?: number | null;
    } | null;
    electricity?: number | null;
    water?: number | null;
    operationProblem?: string | null;
    collectionProblems?: string | null;
    branchOperationProblem?: string | null;
    clients?: {
      count?: number | null;
      major?: string | null;
      namesAndContacts?: string | null;
    } | null;
    suppliers?: {
      count?: number | null;
      major?: string | null;
      namesAndContacts?: string | null;
    } | null;
  } | null;
  otherRemarks?: string | null;
};

export type HouseExpenses = {
  rental?: number | null;
  salary?: number | null;
  electricity?: number | null;
  school?: number | null;
  water?: number | null;
  internet?: number | null;
  foods?: number | null;
  others?: number | null;
};

/**
 * Business Income column — typed fields only (6.0.c / Phase 3.5.4).
 * No 82% / 30% formulas enforced.
 */
export type BusinessIncomeTyped = {
  totalSalesYearly?: number | null;
  netIncomeYearly?: number | null;
  netIncomePercentage?: number | null;
  operationalExpenses?: number | null;
  netIncomePerMonth?: number | null;
  netIncome?: number | null;
  thirtyPercentOfMonthlyNetIncome?: number | null;
  unlabeled?: number | null;
  total?: number | null;
};

export type FieldVisitRecommendation = {
  evaluationSummary?: string | null;
  creditRealizationRisk?: "high" | "medium" | "low" | null;
  notes?: string | null;
  houseExpenses?: HouseExpenses | null;
  businessIncome?: BusinessIncomeTyped | null;
  recommendation?: "for_approval" | "for_disapproval" | null;
  preparedBy?: string | null;
  preparedDate?: string | null;
  reviewedBy?: string | null;
  reviewedDate?: string | null;
};

export type FieldVisit = {
  header?: FieldVisitHeader | null;
  residence?: FieldVisitResidence | null;
  business?: FieldVisitBusiness | null;
  recommendation?: FieldVisitRecommendation | null;
};

export type SmeReloanHouseholdExpenses = {
  electricity?: number | null;
  water?: number | null;
  internet?: number | null;
  subdivisionDues?: number | null;
  school?: number | null;
  helpersSalary?: number | null;
  monthlyAmortization?: number | null;
};

export type SmeReloanBusinessExpenses = {
  employeeSalary?: number | null;
  water?: number | null;
  electricity?: number | null;
  internet?: number | null;
  rental?: number | null;
  operationalExpenses?: number | null;
  /** Extra blank line F42 — stored if filled, NEVER included in total (6.0.e.2). */
  extraLine?: number | null;
};

export type SmeReloanVerification = {
  header?: FieldVisitHeader | null;
  residence?: {
    typeOfResidence?: string | null;
    stillResiding?: boolean | null;
    owned?: string | null;
    ownedYearsOfStay?: number | null;
    transferResidence?: boolean | null;
    renting?: boolean | null;
    monthlyRental?: number | null;
    rentingYearsOfStay?: number | null;
    transferNewAddress?: string | null;
    householdExpenses?: SmeReloanHouseholdExpenses | null;
    otherRemarks?: string | null;
  } | null;
  business?: {
    condition?: "poor" | "good" | "excellent" | null;
    permits?: "updated" | "not_updated" | null;
    stocksNo?: number | null;
    stocksEstimatedCost?: number | null;
    collectionProblem?: string | null;
    operationProblem?: string | null;
    businessExpenses?: SmeReloanBusinessExpenses | null;
    otherRemarks?: string | null;
  } | null;
  baseOnFs?: {
    totalSales?: number | null;
    netIncomePercentage?: number | null;
    opexBusinessExpense?: number | null;
    netIncomePerMonth?: number | null;
  } | null;
  risk?: "low" | "medium" | "high" | null;
  recommendation?: string | null;
  /** Name fields only — CIG owns the screen (6.0.b provisional). */
  verifiedBy?: string | null;
  notedBy?: string | null;
};

export function emptyInformants(count = 3): FieldVisitInformant[] {
  return Array.from({ length: count }, () => ({ name: "", address: "" }));
}

/** Recommendation G34 — sum of 8 house-expense lines. */
export function sumHouseExpenses(expenses: HouseExpenses | null | undefined): number {
  if (!expenses) return 0;
  return sumHalfUp(
    Number(expenses.rental ?? 0),
    Number(expenses.salary ?? 0),
    Number(expenses.electricity ?? 0),
    Number(expenses.school ?? 0),
    Number(expenses.water ?? 0),
    Number(expenses.internet ?? 0),
    Number(expenses.foods ?? 0),
    Number(expenses.others ?? 0),
  );
}

/** Re-loan L23 — 7 household inputs. */
export function sumReloanHouseholdExpenses(
  expenses: SmeReloanHouseholdExpenses | null | undefined,
): number {
  if (!expenses) return 0;
  return sumHalfUp(
    Number(expenses.electricity ?? 0),
    Number(expenses.water ?? 0),
    Number(expenses.internet ?? 0),
    Number(expenses.subdivisionDues ?? 0),
    Number(expenses.school ?? 0),
    Number(expenses.helpersSalary ?? 0),
    Number(expenses.monthlyAmortization ?? 0),
  );
}

/**
 * Re-loan L41 — 6 inputs. F42 (`extraLine`) is intentionally excluded (6.0.e.2).
 */
export function sumReloanBusinessExpenses(
  expenses: SmeReloanBusinessExpenses | null | undefined,
): number {
  if (!expenses) return 0;
  return sumHalfUp(
    Number(expenses.operationalExpenses ?? 0),
    Number(expenses.rental ?? 0),
    Number(expenses.internet ?? 0),
    Number(expenses.electricity ?? 0),
    Number(expenses.water ?? 0),
    Number(expenses.employeeSalary ?? 0),
  );
}

/**
 * Re-loan M50 = -M49 - L23 — keep negative-sign convention exactly (6.0.e.1).
 */
export function computeReloanTotalNetIncome(
  netIncomePerMonth: number | null | undefined,
  householdTotal: number | null | undefined,
): number {
  return halfUp(-(Number(netIncomePerMonth ?? 0)) - Number(householdTotal ?? 0));
}

function filled(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

export type FieldVisitCompleteness = {
  complete: boolean;
  missing: string[];
};

/** Required subset to unlock Finding for new SME applications. */
export function assessFieldVisitRequired(
  visit: FieldVisit | null | undefined,
): FieldVisitCompleteness {
  const missing: string[] = [];
  const header = visit?.header;
  const residence = visit?.residence;
  const recommendation = visit?.recommendation;

  if (!filled(header?.dateVisited)) missing.push("Field visit: date visited");
  if (!filled(header?.visitedBy)) missing.push("Field visit: visited by");
  if (!filled(header?.clientName)) missing.push("Field visit: client name");
  if (!residence?.residenceType) {
    missing.push("Field visit: type of residence");
  }
  if (!recommendation?.creditRealizationRisk) {
    missing.push("Field visit: credit realization risk");
  }
  if (!recommendation?.recommendation) {
    missing.push("Field visit: recommendation (approval/disapproval)");
  }
  if (!filled(recommendation?.preparedBy)) {
    missing.push("Field visit: prepared by");
  }

  return { complete: missing.length === 0, missing };
}

/** Required subset for SME re-loan verification form. */
export function assessSmeReloanRequired(
  reloan: SmeReloanVerification | null | undefined,
): FieldVisitCompleteness {
  const missing: string[] = [];
  if (!filled(reloan?.header?.dateVisited)) {
    missing.push("Re-loan verification: date visited");
  }
  if (!filled(reloan?.header?.visitedBy)) {
    missing.push("Re-loan verification: visited by");
  }
  if (!reloan?.risk) missing.push("Re-loan verification: risk");
  if (!filled(reloan?.recommendation)) {
    missing.push("Re-loan verification: recommendation");
  }
  if (!filled(reloan?.verifiedBy)) {
    missing.push("Re-loan verification: verified by (Field Investigator name)");
  }

  return { complete: missing.length === 0, missing };
}
