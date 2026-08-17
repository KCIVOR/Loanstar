import test from "node:test";
import assert from "node:assert/strict";

import { computeDelta, parsePeriod, presetPeriod, priorPeriod } from "../period";

test("parsePeriod reads explicit from/to when both are present", () => {
  const params = new URLSearchParams({ from: "2026-08-01", to: "2026-08-17" });
  assert.deepEqual(parsePeriod(params), { from: "2026-08-01", to: "2026-08-17" });
});

test("parsePeriod ignores a lone from/to and falls back to month-to-date", () => {
  const params = new URLSearchParams({ from: "2026-08-01" });
  const period = parsePeriod(params);
  // Only assert shape/format here — "today" is not fixed in this test.
  assert.match(period.from, /^\d{4}-\d{2}-01$/);
  assert.match(period.to, /^\d{4}-\d{2}-\d{2}$/);
});

test("priorPeriod returns the same-length period immediately before, mid-month", () => {
  // Aug 1–17 is 17 days; prior should be July 15–31 (also 17 days), no gap or overlap.
  const prior = priorPeriod({ from: "2026-08-01", to: "2026-08-17" });
  assert.deepEqual(prior, { from: "2026-07-15", to: "2026-07-31" });
});

test("priorPeriod handles a full-month period across a month boundary", () => {
  const prior = priorPeriod({ from: "2026-08-01", to: "2026-08-31" });
  assert.deepEqual(prior, { from: "2026-07-01", to: "2026-07-31" });
});

test("priorPeriod handles a single-day period", () => {
  const prior = priorPeriod({ from: "2026-08-17", to: "2026-08-17" });
  assert.deepEqual(prior, { from: "2026-08-16", to: "2026-08-16" });
});

test("priorPeriod crosses a leap day correctly (2028 is a leap year)", () => {
  // March 1 is a single day; the day before is Feb 29 in a leap year.
  const prior = priorPeriod({ from: "2028-03-01", to: "2028-03-01" });
  assert.deepEqual(prior, { from: "2028-02-29", to: "2028-02-29" });
});

test("priorPeriod crosses a non-leap Feb/March boundary correctly", () => {
  const prior = priorPeriod({ from: "2026-03-01", to: "2026-03-01" });
  assert.deepEqual(prior, { from: "2026-02-28", to: "2026-02-28" });
});

test("computeDelta returns null deltaPct when prior is null", () => {
  assert.deepEqual(computeDelta(100, null), { deltaAbs: null, deltaPct: null });
});

test("computeDelta returns null deltaPct (never Infinity) when prior is zero", () => {
  const { deltaAbs, deltaPct } = computeDelta(100, 0);
  assert.equal(deltaAbs, 100);
  assert.equal(deltaPct, null);
});

test("computeDelta computes a normal percentage change", () => {
  const { deltaAbs, deltaPct } = computeDelta(150, 100);
  assert.equal(deltaAbs, 50);
  assert.equal(deltaPct, 50);
});

test("computeDelta computes a negative percentage change", () => {
  const { deltaAbs, deltaPct } = computeDelta(80, 100);
  assert.equal(deltaAbs, -20);
  assert.equal(deltaPct, -20);
});

test("presetPeriod mtd starts on the 1st of the current month", () => {
  const now = new Date("2026-08-17T12:00:00Z");
  assert.deepEqual(presetPeriod("mtd", now), { from: "2026-08-01", to: "2026-08-17" });
});

test("presetPeriod qtd starts on the 1st of the current quarter", () => {
  const now = new Date("2026-08-17T12:00:00Z"); // Q3 -> July
  assert.deepEqual(presetPeriod("qtd", now), { from: "2026-07-01", to: "2026-08-17" });
});

test("presetPeriod qtd handles the first month of a quarter correctly", () => {
  const now = new Date("2026-01-05T12:00:00Z"); // Q1 -> January
  assert.deepEqual(presetPeriod("qtd", now), { from: "2026-01-01", to: "2026-01-05" });
});

test("presetPeriod ytd starts on January 1st", () => {
  const now = new Date("2026-08-17T12:00:00Z");
  assert.deepEqual(presetPeriod("ytd", now), { from: "2026-01-01", to: "2026-08-17" });
});

test("presetPeriod last12m starts the day after this date one year ago", () => {
  const now = new Date("2026-08-17T12:00:00Z");
  assert.deepEqual(presetPeriod("last12m", now), { from: "2025-08-18", to: "2026-08-17" });
});
