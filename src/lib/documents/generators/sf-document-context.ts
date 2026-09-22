import {
  findSourceVariant,
  type SourceVariant,
} from "../fidelity/source-registry";

export type SfDocumentKind =
  | "disclosure"
  | "promissory_note"
  | "demand_letter_second"
  | "ar_atm";

export type SfDocumentSourceRequest = {
  kind?: SfDocumentKind;
  hasSpouse?: boolean;
};

const FAMILY_BY_KIND: Readonly<Record<Exclude<SfDocumentKind, "ar_atm">, string>> = {
  disclosure: "sf-disclosure-statement",
  promissory_note: "sf-promissory-note",
  demand_letter_second: "sf-demand-letter-second-notice",
};

export function resolveSfDocumentSource(
  request: SfDocumentSourceRequest | null | undefined,
): SourceVariant | null {
  if (!request?.kind) return null;

  if (request.kind === "ar_atm") {
    if (typeof request.hasSpouse !== "boolean") return null;

    return findSourceVariant({
      family: "sf-atm-acknowledgement-receipt",
      dimensions: { hasSpouse: request.hasSpouse },
    });
  }

  const family = FAMILY_BY_KIND[request.kind];
  if (!family) return null;

  return findSourceVariant({ family, dimensions: {} });
}
