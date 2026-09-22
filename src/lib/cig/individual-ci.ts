/**
 * Individual CI form resolution.
 *
 * Individual switched from the CI & References Form to the Field Visit form
 * (2026-09-22). 18 pre-switch applications hold `pic_verification` data and
 * must keep rendering it, so DISPLAY readers ask this which form's data a
 * given file actually holds. Live gates (sequence/submit/forward) always
 * require the Field Visit.
 *
 * Deliberately structural + `unknown`-typed: the three callers pass three
 * different shapes (CIG's VerificationRecord, Committee's narrower inline
 * type, and the Packet's `unknown`-typed projection).
 */
export type IndividualCiSource = {
  fieldVisit?: unknown;
  picVerification?: unknown;
  referenceVerifications?: unknown;
};

/**
 * True if `value` holds any real answer.
 *
 * NOT a truthiness test. `FieldVisitForm`'s `ensureVisit` always emits a
 * skeleton (`header: {}`, `recommendation: {}`, and three blank informant
 * rows under both `residence` and `business`), so `{}` and
 * `[{name:"",address:""}]` must both read as empty — otherwise one blank
 * draft save would hide a legacy file's PIC data.
 *
 * `0` and `false` count as content: they are deliberate answers.
 */
export function hasCiContent(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number") return true;
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.some(hasCiContent);
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasCiContent);
  }
  return false;
}

export function individualCiKind(
  verification: IndividualCiSource | null | undefined,
): "field_visit" | "ci_references" {
  if (!verification) return "field_visit";
  if (hasCiContent(verification.fieldVisit)) return "field_visit";
  if (
    hasCiContent(verification.picVerification) ||
    hasCiContent(verification.referenceVerifications)
  ) {
    return "ci_references";
  }
  return "field_visit"; // fresh file → new form
}
