/**
 * CM Inspection (vehicle / Car Refinancing) and REM Inspection (property /
 * Real Estate) data models — extracted from the client's real Field CI Form
 * workbook (`docs/sme-collateral-ci-form-extraction.md`, 2026-08-19).
 *
 * Kept as a sibling module to field-visit.ts, not merged into it — CM and
 * REM are structurally different from each other and from the SME Field
 * Visit form (no risk-rating section, no shared shape), same design
 * principle already used for FieldVisit vs SmeReloanVerification.
 */

export type CollateralChecklistItem = {
  working?: boolean | null;
  notWorking?: boolean | null;
  remarks?: string | null;
};

export type CollateralYesNoItem = {
  yes?: boolean | null;
  no?: boolean | null;
  remarks?: string | null;
};

export type CollateralConditionItem = {
  good?: boolean | null;
  fair?: boolean | null;
  poor?: boolean | null;
  remarks?: string | null;
};

// ---------------------------------------------------------------------------
// CM Inspection (Vehicle / Car Refinancing)
// ---------------------------------------------------------------------------

export type CmAccount = {
  accountName?: string | null;
  address?: string | null;
};

export type CmOrCrDetails = {
  mvFile?: string | null;
  plateNumber?: string | null;
  engineNo?: string | null;
  /** Sheet's own spelling — "Chasis," not "Chassis." Kept verbatim. */
  chasisNo?: string | null;
};

export type CmRegistration = {
  registeredOwner?: string | null;
  addressRegistered?: string | null;
  encumberedTo?: string | null;
  ltoAddress?: string | null;
  orNo?: string | null;
  orDate?: string | null;
  amount?: number | null;
};

export type CmInsurance = {
  insurer?: string | null;
  amountInsured?: number | null;
  typeOfCoverage?: string | null;
};

export type CmVehiclesChecklist = {
  wipers?: CollateralChecklistItem | null;
  battery?: CollateralChecklistItem | null;
  coolant?: CollateralChecklistItem | null;
  radio?: CollateralChecklistItem | null;
  sideMirror?: CollateralChecklistItem | null;
  windows?: CollateralChecklistItem | null;
  /** Sheet spelling: "Ligther." */
  lighter?: CollateralChecklistItem | null;
  aircon?: CollateralChecklistItem | null;
  headLights?: CollateralChecklistItem | null;
  high?: CollateralChecklistItem | null;
  low?: CollateralChecklistItem | null;
  cabinLights?: CollateralChecklistItem | null;
  shocksAbsorber?: CollateralChecklistItem | null;
  /** Sheet spelling: "Break Fluid." */
  brakeFluid?: CollateralChecklistItem | null;
  horn?: CollateralChecklistItem | null;
  doors?: CollateralChecklistItem | null;
};

export type CmOthers = {
  keys?: {
    remote?: CollateralYesNoItem | null;
    ignition?: CollateralYesNoItem | null;
    keyless?: CollateralYesNoItem | null;
  } | null;
  /** Sheet spelling: "Speed Dometer." */
  speedometer?: {
    analog?: CollateralYesNoItem | null;
    digital?: CollateralYesNoItem | null;
  } | null;
  steeringWheel?: {
    power?: CollateralYesNoItem | null;
    nonePower?: CollateralYesNoItem | null;
  } | null;
  tires?: {
    ordinary?: CollateralYesNoItem | null;
    mags?: CollateralYesNoItem | null;
    /** Single free-text value, no Yes/No pair, per the sheet. */
    threadOfTiresPercent?: number | null;
    remarks?: string | null;
  } | null;
};

export type CmVehiclesCondition = {
  engine?: CollateralConditionItem | null;
  bumper?: CollateralConditionItem | null;
  body?: CollateralConditionItem | null;
  grills?: CollateralConditionItem | null;
  /** The sheet lists "Body" twice — a duplicate/likely typo in the client's
   * own template. Kept as a distinct field rather than silently merged or
   * renamed; flag with the client rather than "fixing" it unilaterally. */
  bodySecond?: CollateralConditionItem | null;
  fender?: CollateralConditionItem | null;
  paint?: CollateralConditionItem | null;
  floorMatting?: CollateralConditionItem | null;
  indoorRoofCeiling?: CollateralConditionItem | null;
  upholster?: CollateralConditionItem | null;
  differentialBox?: CollateralConditionItem | null;
};

export type CmInspection = {
  account?: CmAccount | null;
  orCrDetails?: CmOrCrDetails | null;
  registration?: CmRegistration | null;
  insurance?: CmInsurance | null;
  odometerDuringInspection?: number | null;
  vehiclesChecklist?: CmVehiclesChecklist | null;
  others?: CmOthers | null;
  vehiclesCondition?: CmVehiclesCondition | null;
  verifiedBy?: string | null;
};

// ---------------------------------------------------------------------------
// REM Inspection (Real Estate)
// ---------------------------------------------------------------------------

export type RemAccount = {
  accountName?: string | null;
  address?: string | null;
};

export type RemTitleDetails = {
  registeredOwnerAtTitle?: string | null;
  yearRegister?: string | null;
  addressRegisteredAtTitle?: string | null;
  /** 5 blank full-width lines in the source sheet — a free-text block, not a
   * single field. Stored as one array, one entry per line. */
  annotatedAtTitle?: string[] | null;
};

export type RemInsurance = {
  insurer?: string | null;
  amountInsured?: number | null;
  typeOfCoverage?: string | null;
};

/**
 * The sheet's "checklist" section is a copy-paste leftover from CM
 * Inspection — still literally labeled "VEHICLES CHECK LIST," and includes
 * a vehicle-only "CR" item. Kept verbatim per the extraction doc's
 * recommendation: don't silently correct the client's own template.
 * Only Paint / CR / Rooms / Furnitures are pre-labeled; the other 12 rows
 * are blank for the field investigator to fill in themselves.
 */
export type RemChecklist = {
  paint?: CollateralChecklistItem | null;
  /** Leftover from the CM sheet — Certificate of Registration is a vehicle
   * concept, not real estate. Kept as-is, not renamed. */
  cr?: CollateralChecklistItem | null;
  rooms?: CollateralChecklistItem | null;
  furnitures?: CollateralChecklistItem | null;
  /** Up to 12 additional items the field investigator writes in themselves —
   * the source sheet gives no labels for these rows. */
  additionalItems?: Array<{
    label?: string | null;
    working?: boolean | null;
    notWorking?: boolean | null;
    remarks?: string | null;
  }> | null;
};

export type RemInspection = {
  account?: RemAccount | null;
  titleDetails?: RemTitleDetails | null;
  insurance?: RemInsurance | null;
  checklist?: RemChecklist | null;
  /** 5 blank, unstructured lines — free text only, unlike CM's structured
   * Others section. */
  others?: string[] | null;
  verifiedBy?: string | null;
};

// ---------------------------------------------------------------------------
// Completeness
// ---------------------------------------------------------------------------

export type CollateralInspectionCompleteness = {
  complete: boolean;
  missing: string[];
};

function filled(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

/**
 * Required subset to consider CM Inspection done. Neither sheet has a
 * risk-rating/recommendation section (confirmed in the extraction) — this is
 * a pure inspection checklist with a sign-off, so the minimum is: who/what
 * was inspected, and who verified it.
 */
export function assessCmInspectionRequired(
  cm: CmInspection | null | undefined,
): CollateralInspectionCompleteness {
  const missing: string[] = [];
  if (!filled(cm?.account?.accountName)) {
    missing.push("CM Inspection: account name");
  }
  if (!filled(cm?.orCrDetails?.plateNumber)) {
    missing.push("CM Inspection: plate number");
  }
  if (!filled(cm?.verifiedBy)) {
    missing.push("CM Inspection: verified by");
  }
  return { complete: missing.length === 0, missing };
}

/** Same minimal standard as CM: identify the borrower, identify the asset
 * (here, the title's registered owner), and who verified it. */
export function assessRemInspectionRequired(
  rem: RemInspection | null | undefined,
): CollateralInspectionCompleteness {
  const missing: string[] = [];
  if (!filled(rem?.account?.accountName)) {
    missing.push("REM Inspection: account name");
  }
  if (!filled(rem?.titleDetails?.registeredOwnerAtTitle)) {
    missing.push("REM Inspection: registered owner at the title");
  }
  if (!filled(rem?.verifiedBy)) {
    missing.push("REM Inspection: verified by");
  }
  return { complete: missing.length === 0, missing };
}
