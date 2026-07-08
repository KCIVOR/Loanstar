/** HALF-UP rounding to 2 decimal places (G3). Uses centavo integers to avoid float drift. */
export function halfUp(value: number): number {
  return Math.round(Math.round(value * 1000) / 10) / 100;
}

/** Convert peso amount to whole centavos. */
export function toCentavos(value: number): number {
  return Math.round(halfUp(value) * 100);
}

/** Convert centavos back to pesos. */
export function fromCentavos(centavos: number): number {
  return centavos / 100;
}

/** HALF-UP rate multiply: amount × (numerator / denominator). */
export function rateOf(
  amountCentavos: number,
  numerator: number,
  denominator: number,
): number {
  return Math.round((amountCentavos * numerator) / denominator);
}

/** Sum numeric values with HALF-UP at each addition step. */
export function sumHalfUp(...values: number[]): number {
  return values.reduce((acc, value) => halfUp(acc + value), 0);
}
