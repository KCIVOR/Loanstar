export type SeafarerBorrowerType = "SEAFARER" | "ALLOTTEE";

/** Null means the classification was never recorded; never infer it from contacts. */
export function resolveSeafarerBorrowerType(segment: string, value: unknown): SeafarerBorrowerType | null {
  if (value == null) return null;
  if (segment !== "seafarer" || (value !== "SEAFARER" && value !== "ALLOTTEE")) {
    throw new Error("Borrower type must be Seafarer or Allottee for a Seafarer loan");
  }
  return value;
}

export function seafarerBorrowerTypeLabel(value: SeafarerBorrowerType | null | undefined): string {
  return value === "SEAFARER" ? "Seafarer" : value === "ALLOTTEE" ? "Allottee" : "Not recorded";
}
