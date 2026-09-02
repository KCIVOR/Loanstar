import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { addCalendarMonths } from "../release-date";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("addCalendarMonths — month-overflow bug fix (2026-08-30)", () => {
  it("day 30 anchor advancing into February (non-leap year) clamps to Feb 28", () => {
    // 2026-09-30 + 5 months = February 2027 (not a leap year).
    const result = addCalendarMonths(new Date(2026, 8, 30), 5);
    assert.equal(ymd(result), "2027-02-28");
  });

  it("day 30 anchor advancing into February (leap year) clamps to Feb 29", () => {
    // 2027-09-30 + 5 months = February 2028 (a leap year).
    const result = addCalendarMonths(new Date(2027, 8, 30), 5);
    assert.equal(ymd(result), "2028-02-29");
  });

  it("day 31 anchor advancing into a 30-day month clamps correctly", () => {
    // 2026-08-31 + 3 months = November (30 days).
    const result = addCalendarMonths(new Date(2026, 7, 31), 3);
    assert.equal(ymd(result), "2026-11-30");
  });

  it("ordinary mid-month day is unaffected", () => {
    const result = addCalendarMonths(new Date(2026, 7, 15), 2);
    assert.equal(ymd(result), "2026-10-15");
  });

  it("reproduces the exact live repro: Aug 30 release, 6th monthly installment", () => {
    // Regression guard for the bug found manually 2026-08-30 — previously
    // rolled to 2027-03-02, must now land on 2027-02-28.
    const firstPayment = new Date(2026, 8, 30); // Sep 30, 2026
    const sixthInstallment = addCalendarMonths(firstPayment, 5); // installment index 5 = the 6th
    assert.equal(ymd(sixthInstallment), "2027-02-28");
  });

  it("the day override parameter forces a specific day-of-month, still clamped", () => {
    // Reproduces the Quarterly fix: release day 31 must never overflow the
    // month before dueDay gets applied — pass dueDay directly instead.
    const release = new Date(2026, 7, 31); // Aug 31, 2026
    const result = addCalendarMonths(release, 3, 10); // 3 months later, forced to the 10th
    assert.equal(ymd(result), "2026-11-10");
  });

  it("day override still clamps when the forced day doesn't fit the target month", () => {
    const release = new Date(2026, 0, 1); // Jan 1, 2026
    const result = addCalendarMonths(release, 1, 31); // Feb has no 31st
    assert.equal(ymd(result), "2026-02-28");
  });

  it("crosses a year boundary correctly", () => {
    const result = addCalendarMonths(new Date(2026, 10, 15), 3); // Nov 15 + 3mo
    assert.equal(ymd(result), "2027-02-15");
  });

  it("months = 0 returns the same date", () => {
    const result = addCalendarMonths(new Date(2026, 5, 20), 0);
    assert.equal(ymd(result), "2026-06-20");
  });
});
