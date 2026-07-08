/** G2 guard: minimum processing fee rate (~7.354%) per SF computation spec. */
export const MIN_PF_RATE = 0.07354;

export type PfRateValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

/**
 * Validates that a processing fee rate meets the G2 minimum enrollment threshold.
 * Rejects rates below MIN_PF_RATE (e.g. 6.5% → blocked).
 */
export function validatePfRate(pfRate: number): PfRateValidationResult {
  if (!Number.isFinite(pfRate)) {
    return { valid: false, reason: "Processing fee rate must be a finite number" };
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
export function assertValidPfRate(pfRate: number): void {
  const result = validatePfRate(pfRate);
  if (!result.valid) {
    throw new Error(result.reason);
  }
}
