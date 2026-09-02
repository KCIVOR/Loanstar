/**
 * Co-Borrower feature — pure helpers, no Supabase / server deps so they can
 * be imported by client components and unit-tested directly. See
 * docs/revision-plans/feature-co-borrower-section.md.
 *
 * The requirement is advisory only: it never blocks a status transition or a
 * release. These helpers only decide who may edit the list and what to show.
 */

export type CoBorrower = { fullName: string; address: string };

/**
 * Statuses in which co-borrower details may still be edited — the whole
 * intake window plus the post-approval / pre-release negotiation window.
 * Once a file is at `lra_pending` or beyond it is locked for release and the
 * dedicated route refuses further edits.
 */
export const CO_BORROWER_EDITABLE_STATUSES = [
  "registered",
  "documents_pending",
  "submitted",
  "on_hold",
  "for_revision",
  "approved",
  "awaiting_confirmation",
  "negotiating_terms",
] as const;

export function isCoBorrowerEditableStatus(status: string): boolean {
  return (CO_BORROWER_EDITABLE_STATUSES as readonly string[]).includes(status);
}

/**
 * Whether an approving committee may attach a co-borrower requirement to an
 * application of this segment (Phase 2). Seafarer never can — product
 * decision, 2026-09-01. Kept pure so it is unit-testable; `executeFinalAction`
 * calls it on its approve path.
 */
export function assertCoBorrowerRequirementAllowed(
  segment: string | null,
): { ok: true } | { ok: false; reason: string } {
  if (segment === "seafarer") {
    return {
      ok: false,
      reason:
        "A co-borrower requirement cannot be attached to a seafarer application.",
    };
  }
  return { ok: true };
}

/**
 * Server-side gate for the dedicated co-borrower write route (Phase 4).
 * Returns `{ ok: true }` or a `{ ok: false, reason }` the route turns into a
 * 400. All three rejections are precondition failures the caller can fix.
 */
export function assertCanEditCoBorrowers(input: {
  segment: string | null;
  coBorrowerRequired: boolean;
  status: string;
}): { ok: true } | { ok: false; reason: string } {
  if (input.segment === "seafarer") {
    return {
      ok: false,
      reason: "Co-borrowers do not apply to seafarer applications.",
    };
  }
  if (input.coBorrowerRequired !== true) {
    return {
      ok: false,
      reason: "This application does not require a co-borrower.",
    };
  }
  if (!isCoBorrowerEditableStatus(input.status)) {
    return {
      ok: false,
      reason: `Co-borrower details can no longer be edited at status "${input.status}".`,
    };
  }
  return { ok: true };
}

/**
 * What the LRA page should show for co-borrower (Phase 6). Advisory only —
 * `"missing"` is a warning the release officer can proceed past, never a gate.
 *  - `"not_required"` — committee didn't ask for one → show nothing.
 *  - `"provided"`     — asked for, and at least one is on file → read-only list.
 *  - `"missing"`      — asked for, none on file → amber "you may still proceed".
 */
export function coBorrowerBannerState(input: {
  coBorrowerRequired: boolean;
  coBorrowers: CoBorrower[];
}): "not_required" | "provided" | "missing" {
  if (input.coBorrowerRequired !== true) return "not_required";
  return input.coBorrowers.length > 0 ? "provided" : "missing";
}

/** Normalize a raw jsonb value into a clean `CoBorrower[]` (drops malformed
 * entries, trims strings). Used on both the read and write sides. */
export function normalizeCoBorrowers(raw: unknown): CoBorrower[] {
  if (!Array.isArray(raw)) return [];
  const out: CoBorrower[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const fullName = String((entry as Record<string, unknown>).fullName ?? "").trim();
    const address = String((entry as Record<string, unknown>).address ?? "").trim();
    if (fullName && address) out.push({ fullName, address });
  }
  return out;
}
