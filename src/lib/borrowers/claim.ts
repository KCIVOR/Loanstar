export type ClaimableBorrowerRow = {
  id: string;
  user_id: string | null;
  email: string;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  suffix?: string | null;
  date_of_birth?: string | null;
  place_of_birth?: string | null;
  citizenship?: string | null;
  civil_status?: string | null;
  gender?: string | null;
  mobile_phone?: string | null;
  landline?: string | null;
};

export type RegistrationBorrowerClass =
  | "new"
  | "claimable"
  | "already_claimed";

export type ClaimFormFields = {
  userId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  dateOfBirth?: string;
  placeOfBirth?: string;
  citizenship?: string;
  civilStatus?: string;
  gender?: string;
  mobilePhone?: string;
  landline?: string;
};

export function normalizeBorrowerEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function classifyBorrowerForRegistration(
  row: Pick<ClaimableBorrowerRow, "user_id"> | null | undefined,
): RegistrationBorrowerClass {
  if (!row) return "new";
  if (row.user_id) return "already_claimed";
  return "claimable";
}

function isBlank(value: string | null | undefined): boolean {
  return value == null || String(value).trim() === "";
}

/**
 * Claim patch: set user_id; fill only NULL/empty profile columns from the form.
 * Never overwrite CSA-populated fields with registration form values.
 */
export function buildClaimProfilePatch(
  existing: ClaimableBorrowerRow,
  form: ClaimFormFields,
): Record<string, string | null> {
  const patch: Record<string, string | null> = {
    user_id: form.userId,
  };

  const pairs: Array<[keyof ClaimableBorrowerRow, string | undefined]> = [
    ["first_name", form.firstName],
    ["middle_name", form.middleName],
    ["last_name", form.lastName],
    ["suffix", form.suffix],
    ["date_of_birth", form.dateOfBirth],
    ["place_of_birth", form.placeOfBirth],
    ["citizenship", form.citizenship],
    ["civil_status", form.civilStatus],
    ["gender", form.gender],
    ["mobile_phone", form.mobilePhone],
    ["landline", form.landline],
  ];

  for (const [column, formValue] of pairs) {
    if (!isBlank(existing[column] as string | null | undefined)) continue;
    if (formValue == null || String(formValue).trim() === "") continue;
    patch[column] = String(formValue).trim();
  }

  return patch;
}
