import type { BorrowerProfile } from "@/lib/borrowers/types";

export type ApplicationFormCompleteness = {
  complete: boolean;
  missing: string[];
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

/**
 * Frozen §2.1 endorse minimum for the digital loan application form.
 * Do not expand without an explicit product decision.
 */
export function assessApplicationFormCompleteness(
  profile: ApplicationFormProfile | null | undefined,
): ApplicationFormCompleteness {
  const missing: string[] = [];

  if (!profile) {
    return {
      complete: false,
      missing: [
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
      ],
    };
  }

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
  if (!isFilledString(profile.manningAgency?.name)) {
    missing.push("Application form: manning agency name");
  }
  if (!isFilledString(profile.picWork?.rank)) {
    missing.push("Application form: rank");
  }
  if (!isFilledString(profile.picWork?.vessel)) {
    missing.push("Application form: vessel");
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
