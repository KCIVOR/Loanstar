/** G2 guard: minimum processing fee rate (~7.354%) per SF computation spec. */
export const MIN_PF_RATE = 0.07354;

export type PfRateValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

export type PfRateValidationOptions = {
  /**
   * G2 is Seafarer-only (Calculator SME extraction 2026-08-07): real SME loans
   * run 0–11% PF. SME enrollment skips this floor; DB CHECK is also segment-aware.
   * Individual reuses SME's rate calculator (confirmed 2026-08-19), so it skips
   * the floor for the same reason SME does.
   */
  segment?: "seafarer" | "sme" | "individual";
};

/**
 * Validates that a processing fee rate meets the G2 minimum enrollment threshold.
 * Rejects rates below MIN_PF_RATE for Seafarer (e.g. 6.5% → blocked).
 * SME and Individual: no G2 floor.
 */
export function validatePfRate(
  pfRate: number,
  options?: PfRateValidationOptions,
): PfRateValidationResult {
  if (!Number.isFinite(pfRate)) {
    return { valid: false, reason: "Processing fee rate must be a finite number" };
  }

  if (options?.segment === "sme" || options?.segment === "individual") {
    if (pfRate < 0 || pfRate > 1) {
      return { valid: false, reason: "Processing fee rate must be between 0 and 1" };
    }
    return { valid: true };
  }

  if (pfRate < MIN_PF_RATE) {
    return {
      valid: false,
      reason: `Processing fee rate ${(pfRate * 100).toFixed(3)}% is below the minimum ${(MIN_PF_RATE * 100).toFixed(3)}% (G2 guard)`,
    };
  }

  return { valid: true };
}

/** Throws when the pf rate fails G2 validation. */
export function assertValidPfRate(
  pfRate: number,
  options?: PfRateValidationOptions,
): void {
  const result = validatePfRate(pfRate, options);
  if (!result.valid) {
    throw new Error(result.reason);
  }
}
