/**
 * CM Inspection (vehicle / Car Refinancing) and REM Inspection (property /
 * Real Estate) data models — extracted from the client's real Field CI Form
 * workbook (`docs/sme-collateral-ci-form-extraction.md`, 2026-08-19).
 *
 * Kept as a sibling module to field-visit.ts, not merged into it — CM and
 * REM are structurally different from each other and from the SME Field
 * Visit form (no risk-rating section, no shared shape), same design
 * principle already used for FieldVisit vs SmeReloanVerification.
 *
 * Repeatable-collateral redesign (2026-09-11, see
 * docs/revision-plans/ci-collateral-repeatable-entries-plan.md): a loan can
 * be secured by more than one vehicle or property, so the per-item fields
 * live under `vehicles[]` / `properties[]` — `account` and `verifiedBy` stay
 * application-level (one CI visit, one sign-off, however many collateral
 * items). Older saved rows are the pre-redesign single-object shape;
 * `normalizeCmInspection` / `normalizeRemInspection` upgrade either shape to
 * the current one so no caller ever needs to branch on which it got.
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
  /** Not in the client's original CI sheet — added so the vehicle can be
   * identified in the chattel-mortgage documents ({{makeYearModel}}), which
   * need it but had no source anywhere in the system before this. */
  makeYearModel?: string | null;
  /** Same reason as makeYearModel — the mortgage documents' {{crNo}} token. */
  crNo?: string | null;
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

/** One inspected vehicle — everything the old single-object CmInspection held
 * except `account` and `verifiedBy`, which are application-level. */
export type CmVehicleEntry = {
  orCrDetails?: CmOrCrDetails | null;
  registration?: CmRegistration | null;
  insurance?: CmInsurance | null;
  odometerDuringInspection?: number | null;
  vehiclesChecklist?: CmVehiclesChecklist | null;
  others?: CmOthers | null;
  vehiclesCondition?: CmVehiclesCondition | null;
};

export type CmInspection = {
  account?: CmAccount | null;
  vehicles?: CmVehicleEntry[] | null;
  verifiedBy?: string | null;
};

/** Pre-redesign shape: everything CmVehicleEntry now holds sat directly on
 * the top-level object, one vehicle only. */
type LegacyCmInspection = CmVehicleEntry & {
  account?: CmAccount | null;
  verifiedBy?: string | null;
};

const CM_VEHICLE_ENTRY_KEYS = [
  "orCrDetails",
  "registration",
  "insurance",
  "odometerDuringInspection",
  "vehiclesChecklist",
  "others",
  "vehiclesCondition",
] as const;

/**
 * Upgrades a saved `cm_inspection` JSONB value (either shape) to the current
 * `vehicles[]` shape. The single place this happens — every reader should
 * call this instead of trusting the raw column, so a legacy single-vehicle
 * row's data is never silently dropped.
 */
export function normalizeCmInspection(raw: unknown): CmInspection {
  if (!raw || typeof raw !== "object") {
    return { account: {}, vehicles: [], verifiedBy: null };
  }
  const r = raw as Record<string, unknown>;

  if (Array.isArray(r.vehicles)) {
    return {
      account: (r.account as CmAccount | null) ?? {},
      vehicles: r.vehicles as CmVehicleEntry[],
      verifiedBy: (r.verifiedBy as string | null) ?? null,
    };
  }

  const legacy = r as LegacyCmInspection;
  const hasLegacyVehicleFields = CM_VEHICLE_ENTRY_KEYS.some((key) => key in r);

  return {
    account: (legacy.account as CmAccount | null) ?? {},
    verifiedBy: (legacy.verifiedBy as string | null) ?? null,
    vehicles: hasLegacyVehicleFields
      ? [
          {
            orCrDetails: legacy.orCrDetails ?? {},
            registration: legacy.registration ?? {},
            insurance: legacy.insurance ?? {},
            odometerDuringInspection: legacy.odometerDuringInspection ?? null,
            vehiclesChecklist: legacy.vehiclesChecklist ?? {},
            others: legacy.others ?? {},
            vehiclesCondition: legacy.vehiclesCondition ?? {},
          },
        ]
      : [],
  };
}

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

/** Not in the client's original CI sheet — a legal-description block added
 * so the real-estate mortgage documents' {{location}}/{{tctNo}}/{{areaSqm}}/
 * {{technicalDescription}} tokens (which had no source anywhere before this)
 * have real data to render. */
export type RemLegalDescription = {
  location?: string | null;
  tctNo?: string | null;
  areaSqm?: number | null;
  technicalDescription?: string | null;
};

/** One inspected property — everything the old single-object RemInspection
 * held except `account`, `others`, and `verifiedBy`, which stay
 * application-level (the client's "Others" block is 5 general notes lines,
 * not tied to one property). */
export type RemPropertyEntry = {
  titleDetails?: RemTitleDetails | null;
  insurance?: RemInsurance | null;
  checklist?: RemChecklist | null;
  legalDescription?: RemLegalDescription | null;
};

export type RemInspection = {
  account?: RemAccount | null;
  properties?: RemPropertyEntry[] | null;
  /** 5 blank, unstructured lines — free text only, shared across every
   * property on this CI visit (not per-property). */
  others?: string[] | null;
  verifiedBy?: string | null;
};

type LegacyRemInspection = RemPropertyEntry & {
  account?: RemAccount | null;
  others?: string[] | null;
  verifiedBy?: string | null;
};

const REM_PROPERTY_ENTRY_KEYS = [
  "titleDetails",
  "insurance",
  "checklist",
  "legalDescription",
] as const;

/** Same upgrade as `normalizeCmInspection`, for REM. */
export function normalizeRemInspection(raw: unknown): RemInspection {
  if (!raw || typeof raw !== "object") {
    return { account: {}, properties: [], others: [], verifiedBy: null };
  }
  const r = raw as Record<string, unknown>;

  if (Array.isArray(r.properties)) {
    return {
      account: (r.account as RemAccount | null) ?? {},
      properties: r.properties as RemPropertyEntry[],
      others: (r.others as string[] | null) ?? [],
      verifiedBy: (r.verifiedBy as string | null) ?? null,
    };
  }

  const legacy = r as LegacyRemInspection;
  const hasLegacyPropertyFields = REM_PROPERTY_ENTRY_KEYS.some((key) => key in r);

  return {
    account: (legacy.account as RemAccount | null) ?? {},
    others: (legacy.others as string[] | null) ?? [],
    verifiedBy: (legacy.verifiedBy as string | null) ?? null,
    properties: hasLegacyPropertyFields
      ? [
          {
            titleDetails: legacy.titleDetails ?? {},
            insurance: legacy.insurance ?? {},
            checklist: legacy.checklist ?? {},
            legalDescription: legacy.legalDescription ?? {},
          },
        ]
      : [],
  };
}

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
 * was inspected, and who verified it. At least one vehicle must carry a
 * plate number — the form always allows zero-or-more vehicles, so "no
 * vehicles yet" and "vehicle without a plate number" both fail this the same
 * way "no plate number" did before the array redesign.
 */
export function assessCmInspectionRequired(
  cm: CmInspection | null | undefined,
): CollateralInspectionCompleteness {
  const missing: string[] = [];
  if (!filled(cm?.account?.accountName)) {
    missing.push("CM Inspection: account name");
  }
  if (!(cm?.vehicles ?? []).some((v) => filled(v.orCrDetails?.plateNumber))) {
    missing.push("CM Inspection: plate number");
  }
  if (!filled(cm?.verifiedBy)) {
    missing.push("CM Inspection: verified by");
  }
  return { complete: missing.length === 0, missing };
}

/** Same minimal standard as CM: identify the borrower, identify at least one
 * asset (here, a title's registered owner), and who verified it. */
export function assessRemInspectionRequired(
  rem: RemInspection | null | undefined,
): CollateralInspectionCompleteness {
  const missing: string[] = [];
  if (!filled(rem?.account?.accountName)) {
    missing.push("REM Inspection: account name");
  }
  if (
    !(rem?.properties ?? []).some((p) =>
      filled(p.titleDetails?.registeredOwnerAtTitle),
    )
  ) {
    missing.push("REM Inspection: registered owner at the title");
  }
  if (!filled(rem?.verifiedBy)) {
    missing.push("REM Inspection: verified by");
  }
  return { complete: missing.length === 0, missing };
}
