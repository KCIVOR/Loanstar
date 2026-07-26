import test from "node:test";
import assert from "node:assert/strict";

import {
  averageDays,
  bucketByDay,
  bucketByMonth,
  bucketByWeek,
  daysAgoIso,
} from "../buckets";

// Wednesday, 2026-06-17 local time
const NOW = new Date(2026, 5, 17, 12, 0, 0);

test("bucketByWeek returns trailing Monday-based weeks with counts and totals", () => {
  const rows = [
    { at: new Date(2026, 5, 15).toISOString(), value: 100 }, // Mon this week
    { at: new Date(2026, 5, 16).toISOString(), value: 50 }, // Tue this week
    { at: new Date(2026, 5, 9).toISOString(), value: 25 }, // last week
    { at: new Date(2026, 0, 1).toISOString(), value: 999 }, // far outside window
  ];

  const series = bucketByWeek(rows, 4, NOW);
  assert.equal(series.length, 4);

  const thisWeek = series[3];
  assert.equal(thisWeek.count, 2);
  assert.equal(thisWeek.total, 150);

  const lastWeek = series[2];
  assert.equal(lastWeek.count, 1);
  assert.equal(lastWeek.total, 25);

  // out-of-window row excluded everywhere
  const totalCount = series.reduce((s, p) => s + p.count, 0);
  assert.equal(totalCount, 3);
});

test("bucketByMonth returns trailing calendar months", () => {
  const rows = [
    { at: new Date(2026, 5, 2).toISOString(), value: 10 },
    { at: new Date(2026, 4, 20).toISOString(), value: 20 },
    { at: new Date(2026, 4, 25).toISOString() }, // no value → counts, adds 0
  ];

  const series = bucketByMonth(rows, 6, NOW);
  assert.equal(series.length, 6);
  assert.equal(series[5].count, 1);
  assert.equal(series[5].total, 10);
  assert.equal(series[4].count, 2);
  assert.equal(series[4].total, 20);
});

test("bucketByDay counts events per trailing day", () => {
  const rows = [
    { at: new Date(2026, 5, 17, 8).toISOString() },
    { at: new Date(2026, 5, 17, 20).toISOString() },
    { at: new Date(2026, 5, 16, 3).toISOString() },
  ];

  const series = bucketByDay(rows, 3, NOW);
  assert.equal(series.length, 3);
  assert.equal(series[2].count, 2);
  assert.equal(series[1].count, 1);
  assert.equal(series[0].count, 0);
});

test("bucketByWeek ignores null timestamps", () => {
  const series = bucketByWeek([{ at: null, value: 5 }], 2, NOW);
  assert.equal(
    series.reduce((s, p) => s + p.count, 0),
    0,
  );
});

test("averageDays computes mean duration and skips incomplete pairs", () => {
  const result = averageDays([
    { from: "2026-06-01T00:00:00Z", to: "2026-06-04T00:00:00Z" }, // 3d
    { from: "2026-06-01T00:00:00Z", to: "2026-06-02T00:00:00Z" }, // 1d
    { from: null, to: "2026-06-02T00:00:00Z" },
    { from: "2026-06-05T00:00:00Z", to: "2026-06-01T00:00:00Z" }, // negative → skipped
  ]);
  assert.equal(result.averageDays, 2);
  assert.equal(result.sampleCount, 2);
});

test("averageDays returns null when no valid pairs", () => {
  const result = averageDays([{ from: null, to: null }]);
  assert.equal(result.averageDays, null);
  assert.equal(result.sampleCount, 0);
});

test("daysAgoIso returns an ISO timestamp n days back", () => {
  const iso = daysAgoIso(7, NOW);
  const diff = (NOW.getTime() - new Date(iso).getTime()) / 86_400_000;
  assert.equal(diff, 7);
});
