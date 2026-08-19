/**
 * Skill results are serialized straight into the model's context, so they need
 * a size ceiling. The old ceiling was a raw `text.slice(0, 8000)` applied in
 * the agent loop, which cut the JSON mid-object: the model received a truncated
 * document with no closing brace, no idea rows were missing, and a mangled last
 * record it could still half-read. A 50-row account list measured 15,851
 * characters, so roughly half of it silently disappeared.
 *
 * Trimming belongs here instead, at the row level, where the result stays valid
 * JSON and carries an explicit `omitted` count the model can report out loud.
 */

export const DEFAULT_SKILL_BUDGET = 6000;

/** Per-skill overrides. Catalog is definitions-only and worth its size once. */
export const SKILL_BUDGETS: Record<string, number> = {
  get_catalog: 8000,
  get_snapshot: 7000,
  get_trends: 7000,
  get_bottlenecks: 4000,
};

export function budgetFor(skill: string): number {
  return SKILL_BUDGETS[skill] ?? DEFAULT_SKILL_BUDGET;
}

export function measure(value: unknown): number {
  return JSON.stringify(value)?.length ?? 0;
}

/**
 * Returns the payload built from the largest prefix of `rows` that fits in
 * `budget`, telling `build` how many rows it had to drop.
 *
 * When even zero rows exceed the budget the result is returned anyway — a valid
 * oversized document beats a corrupt one, and the caller's own summary fields
 * are what the model needs most.
 */
export function fitToBudget<T, R>(
  rows: R[],
  budget: number,
  build: (visible: R[], omitted: number) => T,
): T {
  const full = build(rows, 0);
  if (measure(full) <= budget) return full;

  let low = 0;
  let high = rows.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (measure(build(rows.slice(0, mid), rows.length - mid)) <= budget) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return build(rows.slice(0, low), rows.length - low);
}
