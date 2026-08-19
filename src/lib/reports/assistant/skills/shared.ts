import type { SupabaseClient } from "@supabase/supabase-js";

import { getMetric } from "@/lib/reports/metrics/registry";
import type { MetricValue, Period } from "@/lib/reports/metrics/types";
import { REPORT_COLLATERALS, REPORT_SEGMENTS } from "@/lib/reports/segments";

/** Order matches `openaiToolDefs()` — a test asserts the two stay in step. */
export const ACTIVE_SKILL_NAMES = [
  "get_catalog",
  "get_snapshot",
  "get_metric",
  "get_trends",
  "get_bottlenecks",
  "get_staff",
  "list_accounts",
  "list_past_due",
  "list_collections",
  "list_pipeline",
] as const;

export type SkillName = (typeof ACTIVE_SKILL_NAMES)[number];

export type SkillResult =
  | { ok: true; name: SkillName; data: unknown }
  | { ok: false; name: string; error: string };

export type SkillContext = {
  supabase: SupabaseClient;
  period: Period;
  includeBorrowerNames?: boolean;
  /**
   * Per-request memo. The model often calls `get_snapshot` and then
   * `list_pipeline` in the same turn, and both recompute the same origination
   * metrics; `get_bottlenecks` needs them too. One map per request keeps that
   * to a single computation without caching across users or periods.
   */
  cache?: Map<string, Promise<unknown>>;
};

export function newSkillCache(): Map<string, Promise<unknown>> {
  return new Map();
}

export function memo<T>(
  ctx: SkillContext,
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  if (!ctx.cache) return load();
  const existing = ctx.cache.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = load();
  ctx.cache.set(key, promise);
  return promise;
}

export const LIST_SKILL_LIMIT = 50;
/** How many movers get flagged before the list stops being a shortlist. */
export const SIGNIFICANT_METRICS = 6;

export const ACCOUNT_VIEWS = ["loans", "borrowers"] as const;
export const ACCOUNT_STATUSES = ["unpaid", "paid", "all"] as const;
export const SEGMENTS = REPORT_SEGMENTS;
export const COLLATERALS = REPORT_COLLATERALS;
export const ACCOUNT_AGING = ["all", "current", "1-30", "31-60", "61-90", "91+"] as const;
export const PAST_DUE_AGING = ["all", "1-30", "31-60", "61-90", "91+", "par30"] as const;

export type AccountView = (typeof ACCOUNT_VIEWS)[number];

export function isSkillName(name: string): name is SkillName {
  return (ACTIVE_SKILL_NAMES as readonly string[]).includes(name);
}

export function pickEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export function parseQuery(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

export function parseObjectArgs(argsJson: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(argsJson) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function matchesRegisterQuery(
  haystacks: Array<string | null | undefined>,
  q: string,
): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return haystacks.some((value) => (value ?? "").toLowerCase().includes(needle));
}

export function findMetricValue(
  metrics: MetricValue[],
  id: string,
): MetricValue | undefined {
  return metrics.find((m) => m.id === id);
}

/**
 * How far a metric moved, as a fraction of where it was. Used only for
 * ordering, so a metric with no prior sorts last rather than infinitely first.
 */
function movement(m: MetricValue): number {
  if (m.deltaPct !== null) return Math.abs(m.deltaPct);
  if (m.prior === null || m.prior === 0 || m.deltaAbs === null) return 0;
  return Math.abs(m.deltaAbs / m.prior) * 100;
}

/**
 * Values that are arithmetically right but read as nonsense in a sentence.
 *
 * Collection efficiency above 100% and a negative average days-to-collect are
 * the same fact seen twice: borrowers paying ahead of schedule, so the period's
 * receipts include installments not yet due. Left unexplained the model reports
 * them as a triumph. Saying it here, once, is cheaper and more reliable than
 * hoping the prompt covers every odd shape a number can take.
 */
function anomalyNote(m: MetricValue): string | undefined {
  if (m.id === "money.collectionEfficiency" && m.value > 100) {
    return "above 100% because borrowers are paying ahead of schedule — receipts include installments not yet due";
  }
  if (m.id === "money.avgDaysToCollect" && m.value < 0) {
    return "negative means payments arrive before the due date on average, not that collection is instant";
  }
  return undefined;
}

/**
 * Metric values dressed for the model: label and unit so it can talk about
 * them, a note where the raw number misleads, and a `significant` flag on the
 * handful that actually moved.
 *
 * `formula` is deliberately absent. It is dead weight on 25 metrics, and the
 * prompt forbids talking in formulas anyway — `get_catalog` exists for the rare
 * question about how something is derived.
 */
export function enrichMetrics(metrics: MetricValue[]) {
  const ranked = [...metrics].sort((a, b) => movement(b) - movement(a));
  const significant = new Set(
    ranked.filter((m) => movement(m) >= 1).slice(0, SIGNIFICANT_METRICS).map((m) => m.id),
  );

  return metrics.map((m) => {
    const def = getMetric(m.id);
    const note = anomalyNote(m);
    return {
      ...m,
      label: def?.label ?? m.id,
      unit: def?.unit ?? "count",
      direction: def?.direction ?? "neutral",
      significant: significant.has(m.id),
      ...(note ? { note } : {}),
    };
  });
}
