import type { BusinessInfo } from "@/lib/borrowers/business-info";
import type { BorrowerProfile } from "@/lib/borrowers/types";

export type ApplicationFormCompleteness = {
  complete: boolean;
  missing: string[];
};

export type ApplicationFormScope = {
  segment?: "seafarer" | "sme";
  entityType?: "individual" | "corporate" | null;
};

/** Narrow input so callers can pass a mapped borrower or a test fixture. */
export type ApplicationFormProfile = Pick<
  BorrowerProfile,
  | "firstName"
  | "lastName"
  | "mobilePhone"
  | "email"
  | "presentAddress"
  | "manningAgency"
  | "picWork"
  | "businessInfo"
  | "profileData"
>;

function isFilledString(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "number") return !Number.isNaN(value);
  return String(value).trim().length > 0;
}

function profileDataString(
  profileData: Record<string, unknown> | null | undefined,
  key: string,
): unknown {
  if (!profileData) return null;
  return profileData[key];
}

const SEAFARER_NULL_MISSING = [
  "Application form: first name",
  "Application form: last name",
  "Application form: mobile phone",
  "Application form: email",
  "Application form: manning agency name",
  "Application form: rank",
  "Application form: vessel",
  "Application form: loan desired",
  "Application form: requested terms",
  "Application form: purpose of loan",
  "Application form: present address",
] as const;

/** Identity minimum from Individual Application Form LSLG v.4.pdf */
const SME_INDIVIDUAL_BUSINESS_CHECKS: Array<{
  key: keyof BusinessInfo;
  label: string;
}> = [
  { key: "companyName", label: "Application form: company / employer name" },
  { key: "companyAddress", label: "Application form: company address" },
  { key: "yearsOfOperation", label: "Application form: years of operation" },
];

/** Identity minimum from Business Application LSLG v.4.pdf (Corporate) */
const SME_CORPORATE_BUSINESS_CHECKS: Array<{
  key: keyof BusinessInfo;
  label: string;
}> = [
  { key: "companyName", label: "Application form: company name" },
  { key: "officeAddress", label: "Application form: office address" },
  { key: "natureOfBusiness", label: "Application form: nature of business" },
  { key: "tin", label: "Application form: TIN" },
  { key: "dateEstablished", label: "Application form: date established" },
];

/**
 * Endorse minimum for the digital loan application form.
 * Seafarer path (default) is frozen — missing[] must stay byte-identical.
 * SME path uses business_info fields from the client Individual/Corporate PDFs.
 */
export function assessApplicationFormCompleteness(
  profile: ApplicationFormProfile | null | undefined,
  scope: ApplicationFormScope = {},
): ApplicationFormCompleteness {
  const segment = scope.segment ?? "seafarer";
  const entityType = scope.entityType ?? null;

  if (!profile) {
    if (segment === "sme") {
      const businessLabels =
        entityType === "corporate"
          ? SME_CORPORATE_BUSINESS_CHECKS.map((c) => c.label)
          : SME_INDIVIDUAL_BUSINESS_CHECKS.map((c) => c.label);
      return {
        complete: false,
        missing: [
          "Application form: first name",
          "Application form: last name",
          "Application form: mobile phone",
          "Application form: email",
          ...businessLabels,
          "Application form: loan desired",
          "Application form: requested terms",
          "Application form: purpose of loan",
          "Application form: present address",
        ],
      };
    }
    return {
      complete: false,
      missing: [...SEAFARER_NULL_MISSING],
    };
  }

  const missing: string[] = [];

  if (!isFilledString(profile.firstName)) {
    missing.push("Application form: first name");
  }
  if (!isFilledString(profile.lastName)) {
    missing.push("Application form: last name");
  }
  if (!isFilledString(profile.mobilePhone)) {
    missing.push("Application form: mobile phone");
  }
  if (!isFilledString(profile.email)) {
    missing.push("Application form: email");
  }

  if (segment === "sme") {
    const biz = profile.businessInfo ?? {};
    const checks =
      entityType === "corporate"
        ? SME_CORPORATE_BUSINESS_CHECKS
        : SME_INDIVIDUAL_BUSINESS_CHECKS;
    for (const check of checks) {
      if (!isFilledString(biz[check.key])) {
        missing.push(check.label);
      }
    }
  } else {
    if (!isFilledString(profile.manningAgency?.name)) {
      missing.push("Application form: manning agency name");
    }
    if (!isFilledString(profile.picWork?.rank)) {
      missing.push("Application form: rank");
    }
    if (!isFilledString(profile.picWork?.vessel)) {
      missing.push("Application form: vessel");
    }
  }

  if (!isFilledString(profileDataString(profile.profileData, "loanDesired"))) {
    missing.push("Application form: loan desired");
  }
  if (
    !isFilledString(profileDataString(profile.profileData, "requestedTerms"))
  ) {
    missing.push("Application form: requested terms");
  }
  if (
    !isFilledString(profileDataString(profile.profileData, "purposeOfLoan"))
  ) {
    missing.push("Application form: purpose of loan");
  }
  if (!isFilledString(profile.presentAddress?.street)) {
    missing.push("Application form: present address");
  }

  return { complete: missing.length === 0, missing };
}
