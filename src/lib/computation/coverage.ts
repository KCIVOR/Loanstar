import { halfUp } from "./money";

export type CoverageCheck = {
  ratio: number | null;
  warning: boolean;
  message: string | null;
};

/** 35% coverage ratio warning per config (monthly amort / monthly income). */
export function checkCoverageRatio(
  monthlyAmortization: number,
  monthlyIncome: number | null | undefined,
  threshold = 0.35,
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
