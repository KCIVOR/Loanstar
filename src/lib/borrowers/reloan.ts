/** Finished — do not block a new apply. Count as history. */
export const RELOAN_TERMINAL_STATUSES = ["paid_off", "denied", "cancelled"] as const;

/** Live or recently disbursed loan accounts — do not block a new apply. */
export const SERVICING_STATUSES = ["released", "closed", "loan_active"] as const;

export type ReloanEligibilityResult =
  | { ok: true }
  | { ok: false; reason: string };

export type NextApplicationKind = "first" | "reloan" | "additional";

export const ORIGINATION_BLOCK_REASON =
  "You already have an application in process. Finish or wait for it to close before starting another.";

/** Origination statuses block a new apply (except a resumable draft, handled by callers). */
export function isOriginationStatus(status: string): boolean {
  if ((RELOAN_TERMINAL_STATUSES as readonly string[]).includes(status)) {
    return false;
  }
  if ((SERVICING_STATUSES as readonly string[]).includes(status)) {
    return false;
  }
  return true;
}

/**
 * A borrower may start another application when every existing file is
 * terminal or in servicing. Origination in flight still blocks. An empty
 * history is allowed (first application).
 */
export function canStartReloan(input: {
  applicationStatuses: string[];
}): ReloanEligibilityResult {
  const open = input.applicationStatuses.filter(isOriginationStatus);

  if (open.length > 0) {
    return {
      ok: false,
      reason: ORIGINATION_BLOCK_REASON,
    };
  }

  return { ok: true };
}

/**
 * What kind of application the borrower may open next, or null if blocked.
 * Empty history → first; terminal history with no servicing → reloan;
 * at least one servicing account → additional.
 */
export function nextApplicationKind(input: {
  applicationStatuses: string[];
}): NextApplicationKind | null {
  if (!canStartReloan(input).ok) return null;
  if (input.applicationStatuses.length === 0) return "first";
  const hasServicing = input.applicationStatuses.some((status) =>
    (SERVICING_STATUSES as readonly string[]).includes(status),
  );
  return hasServicing ? "additional" : "reloan";
}

/**
 * A borrower may hold at most one 'draft' (pre-submission) application at a
 * time. "Start application" resumes that draft instead of erroring or
 * creating a duplicate — canStartReloan's "ongoing application" block would
 * otherwise permanently lock out anyone who starts a draft and abandons it,
 * since 'draft' is not a terminal status. Callers should check this BEFORE
 * calling canStartReloan.
 */
export function findResumableDraft<T extends { id: string; status: string }>(
  applications: T[],
): T | null {
  return applications.find((app) => app.status === "draft") ?? null;
}

export type ReloanSegmentScope = {
  segment: "seafarer" | "sme" | "individual";
  entityType: "individual" | "corporate" | null;
};

/**
 * Segment a borrower-initiated application should carry.
 *
 * A reloan inherits from the application it continues — otherwise an existing SME
 * borrower clicking "apply again" silently gets a Seafarer file: wrong document
 * checklist, and mislabelled when it reaches CSA. Borrowers cannot self-declare
 * SME, so a first application is always Seafarer.
 *
 * segment/entityType are inherited as a PAIR — the DB constraint
 * `loan_applications_entity_type_sme_only` requires entity_type when segment='sme',
 * so an 'sme' parent missing a valid entity_type falls back to Seafarer rather
 * than producing an insert the database would reject.
 */
export function resolveReloanSegment(input: {
  isReloan: boolean;
  parentSegment?: string | null;
  parentEntityType?: string | null;
}): ReloanSegmentScope {
  if (!input.isReloan) {
    return { segment: "seafarer", entityType: null };
  }

  const entityType = input.parentEntityType;
  const inheritSme =
    input.parentSegment === "sme" &&
    (entityType === "individual" || entityType === "corporate");

  if (inheritSme) {
    return { segment: "sme", entityType: entityType as "individual" | "corporate" };
  }

  if (input.parentSegment === "individual") {
    return { segment: "individual", entityType: null };
  }

  return { segment: "seafarer", entityType: null };
}

export type BorrowerCreateSegmentResult =
  | { ok: true; scope: ReloanSegmentScope }
  | { ok: false; error: string };

/**
 * Segment to write when a borrower starts their NEXT application (first or
 * reloan). An explicit `bodySegment` is validated and used for either kind
 * (seafarer → ok; sme → require entityType individual/corporate). When
 * `bodySegment` is omitted/null, fall back by kind: reloan inherits from the
 * parent via `resolveReloanSegment`; first defaults to Seafarer (no entity
 * type) so old clients that POST an empty body behave exactly as before.
 * Declaring 'sme' requires a valid entityType so the insert never hits the
 * DB's `loan_applications_entity_type_sme_only` constraint.
 */
export function resolveBorrowerCreateSegment(input: {
  kind: "first" | "reloan";
  bodySegment?: string | null;
  bodyEntityType?: string | null;
  parentSegment?: string | null;
  parentEntityType?: string | null;
}): BorrowerCreateSegmentResult {
  if (input.bodySegment != null) {
    const bodySegment = input.bodySegment;

    if (bodySegment === "seafarer") {
      return { ok: true, scope: { segment: "seafarer", entityType: null } };
    }

    if (bodySegment === "individual") {
      return { ok: true, scope: { segment: "individual", entityType: null } };
    }

    if (bodySegment !== "sme") {
      return { ok: false, error: `Invalid segment: ${bodySegment}` };
    }

    const entityType = input.bodyEntityType;
    if (entityType !== "individual" && entityType !== "corporate") {
      return {
        ok: false,
        error: "entityType (individual or corporate) is required for SME",
      };
    }

    return { ok: true, scope: { segment: "sme", entityType } };
  }

  if (input.kind === "reloan") {
    return {
      ok: true,
      scope: resolveReloanSegment({
        isReloan: true,
        parentSegment: input.parentSegment,
        parentEntityType: input.parentEntityType,
      }),
    };
  }

  return { ok: true, scope: { segment: "seafarer", entityType: null } };
}
