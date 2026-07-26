/**
 * Phase 8: acknowledge when encoded PDC count is below amortization terms.
 * Soft gate — not a hard block once LRA confirms.
 */

export function pdcShortfallMessage(encoded: number, terms: number): string {
  return `Only ${encoded} of ${terms} amortization checks encoded — confirm to continue`;
}

export function assertPdcShortfallAcknowledged(
  checkCount: number,
  terms: number,
  acknowledgeShortfall?: boolean,
): void {
  if (checkCount < terms && acknowledgeShortfall !== true) {
    throw new Error(pdcShortfallMessage(checkCount, terms));
  }
}

export function isPdcShortfallError(message: string): boolean {
  return /amortization checks encoded — confirm to continue/.test(message);
}
