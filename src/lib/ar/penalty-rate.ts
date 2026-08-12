/**
 * Segment → config_settings key for monthly penalty rate.
 * NULL/unknown must not silently fall back to Seafarer (Phase 5.1).
 */
export function penaltyRateConfigKey(
  segment: string | null | undefined,
): "penalty_rate" | "penalty_rate_sme" {
  if (segment === "sme") return "penalty_rate_sme";
  if (segment === "seafarer") return "penalty_rate";
  throw new Error(
    `masterlist.segment is missing or unknown (${segment ?? "null"}) — cannot choose penalty rate; backfill segment before aging`,
  );
}

export function resolvePenaltyRate(
  segment: string | null | undefined,
  rates: { seafarer: number; sme: number },
): number {
  return penaltyRateConfigKey(segment) === "penalty_rate_sme"
    ? rates.sme
    : rates.seafarer;
}
