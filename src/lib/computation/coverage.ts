import type { SupabaseClient } from "@supabase/supabase-js";

import { halfUp } from "./money";

export const DEFAULT_COVERAGE_THRESHOLD = 0.35;

export type CoverageCheck = {
  ratio: number | null;
  warning: boolean;
  message: string | null;
};

export type CoverageEndorseEvaluation = {
  coverageOk: boolean;
  warnings: string[];
  blocker: string | null;
};

/** 35% coverage ratio warning per config (monthly amort / monthly income). */
export function checkCoverageRatio(
  monthlyAmortization: number,
  monthlyIncome: number | null | undefined,
  threshold = DEFAULT_COVERAGE_THRESHOLD,
): CoverageCheck {
  if (!monthlyIncome || monthlyIncome <= 0) {
    return {
      ratio: null,
      warning: false,
      message: null,
    };
  }

  const ratio = halfUp(monthlyAmortization / monthlyIncome);
  const warning = ratio > threshold;

  return {
    ratio,
    warning,
    message: warning
      ? `Monthly amortization is ${(ratio * 100).toFixed(1)}% of declared income (threshold ${(threshold * 100).toFixed(0)}%)`
      : null,
  };
}

export function formatCoverageBlocker(threshold: number): string {
  const pct = Math.round(threshold * 100);
  return `Monthly amortization exceeds ${pct}% of declared income`;
}

/**
 * Endorse gate: null ratio is non-blocking (income undeclared);
 * ratio must be <= threshold when known.
 */
export function evaluateCoverageForEndorse(
  coverageRatio: number | null,
  threshold: number,
): CoverageEndorseEvaluation {
  if (coverageRatio == null) {
    return {
      coverageOk: true,
      warnings: ["Coverage ratio unknown — monthly income not declared"],
      blocker: null,
    };
  }

  if (coverageRatio > threshold) {
    return {
      coverageOk: false,
      warnings: [],
      blocker: formatCoverageBlocker(threshold),
    };
  }

  return {
    coverageOk: true,
    warnings: [],
    blocker: null,
  };
}

/** Reads admin `config_settings.coverage_ratio`, falls back to 0.35. */
export async function getCoverageThreshold(
  supabase: SupabaseClient,
): Promise<number> {
  const { data } = await supabase
    .from("config_settings")
    .select("value")
    .eq("key", "coverage_ratio")
    .maybeSingle();

  const raw = data?.value;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return DEFAULT_COVERAGE_THRESHOLD;
}
