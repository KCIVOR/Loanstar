import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeDailyInterestLoan,
  daysInMonthOf,
  parseLocalDate,
} from "../daily";

// Task 3 (final): the daily-interest engine mirrors the daily-loan formulas in
// docs/Calculator SME.xlsm (sheet SME):
//   divisor = DAY(EOMONTH(releaseDate,0))  -> ONE value 28-31, from the
//             release month, applied to the whole loan even across a boundary
//   days    = paymentDate - releaseDate    (plain subtraction, no +1)
//   raw     = principal * monthlyRate / divisor * days
//   interest = round(raw, 2)               ; total = round(principal + raw, 2)
// Anchored purely on the two dates passed in (no "today").

describe("daysInMonthOf", () => {
  it("returns the real length of the given month", () => {
    assert.equal(daysInMonthOf(new Date("2026-02-15")), 28); // non-leap February
    assert.equal(daysInMonthOf(new Date("2028-02-15")), 29); // leap February
    assert.equal(daysInMonthOf(new Date("2026-04-15")), 30);
    assert.equal(daysInMonthOf(new Date("2026-07-15")), 31);
  });
});

describe("parseLocalDate", () => {
  it("maps YYYY-MM-DD to a local-midnight date (the day the user typed)", () => {
    const d = parseLocalDate("2026-03-01");
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 2); // March, not February — no UTC-midnight drift
    assert.equal(d.getDate(), 1);
  });

  it("feeds computeDailyInterestLoan so the typed month is the divisor month", () => {
    const r = computeDailyInterestLoan({
      principal: 100_000,
      monthlyRate: 0.03,
      releaseDate: parseLocalDate("2026-02-10"),
      paymentDate: parseLocalDate("2026-02-20"),
    });
    assert.equal(r.daysInReleaseMonth, 28);
    assert.equal(r.days, 10);
  });
});

describe("computeDailyInterestLoan — single divisor = days in the release month", () => {
  it("30-day release month: divisor 30, ₱500 over 5 days", () => {
    const r = computeDailyInterestLoan({
      principal: 100_000,
      monthlyRate: 0.03,
      releaseDate: new Date("2026-09-10"),
      paymentDate: new Date("2026-09-15"),
    });
    assert.equal(r.daysInReleaseMonth, 30);
    assert.equal(r.days, 5);
    assert.equal(r.interest, 500);
    assert.equal(r.totalDue, 100_500);
  });

  it("31-day release month (July): divisor 31, ₱483.87 over 5 days", () => {
    const r = computeDailyInterestLoan({
      principal: 100_000,
      monthlyRate: 0.03,
      releaseDate: new Date("2026-07-10"),
      paymentDate: new Date("2026-07-15"),
    });
    assert.equal(r.daysInReleaseMonth, 31);
    assert.equal(r.days, 5);
    assert.equal(r.interest, 483.87);
    assert.equal(r.totalDue, 100_483.87);
  });

  it("28-day release month (Feb 2026): divisor 28, ₱1,071.43 over 10 days", () => {
    const r = computeDailyInterestLoan({
      principal: 100_000,
      monthlyRate: 0.03,
      releaseDate: new Date("2026-02-10"),
      paymentDate: new Date("2026-02-20"),
    });
    assert.equal(r.daysInReleaseMonth, 28);
    assert.equal(r.days, 10);
    assert.equal(r.interest, 1_071.43);
    assert.equal(r.totalDue, 101_071.43);
  });

  it("leap-year February (2028): divisor 29 (matches EOMONTH; pending client confirmation)", () => {
    const r = computeDailyInterestLoan({
      principal: 100_000,
      monthlyRate: 0.03,
      releaseDate: new Date("2028-02-10"),
      paymentDate: new Date("2028-02-20"),
    });
    assert.equal(r.daysInReleaseMonth, 29);
    assert.equal(r.interest, 1_034.48);
    assert.equal(r.totalDue, 101_034.48);
  });

  it("scales linearly with principal and rate", () => {
    const r = computeDailyInterestLoan({
      principal: 250_000,
      monthlyRate: 0.025,
      releaseDate: new Date("2026-07-10"),
      paymentDate: new Date("2026-07-24"),
    });
    assert.equal(r.daysInReleaseMonth, 31);
    assert.equal(r.days, 14);
    assert.equal(r.interest, 2_822.58);
    assert.equal(r.totalDue, 252_822.58);
  });
});

describe("computeDailyInterestLoan — crossing a month boundary uses the RELEASE month", () => {
  it("released 10 Feb 2026, paid 5 Mar 2026: all 23 days ÷ 28 (not per-day)", () => {
    const r = computeDailyInterestLoan({
      principal: 100_000,
      monthlyRate: 0.03,
      releaseDate: new Date("2026-02-10"),
      paymentDate: new Date("2026-03-05"),
    });
    assert.equal(r.daysInReleaseMonth, 28); // release month, even though days run into March
    assert.equal(r.days, 23);
    // 100000 * 0.03/28 * 23 = 2464.2857… -> 2464.29
    assert.equal(r.interest, 2_464.29);
    assert.equal(r.totalDue, 102_464.29);
  });

  it("released 10 Jul 2026, paid 20 Aug 2026: all 41 days ÷ 31", () => {
    const r = computeDailyInterestLoan({
      principal: 100_000,
      monthlyRate: 0.03,
      releaseDate: new Date("2026-07-10"),
      paymentDate: new Date("2026-08-20"),
    });
    assert.equal(r.daysInReleaseMonth, 31);
    assert.equal(r.days, 41);
    assert.equal(r.interest, 3_967.74);
    assert.equal(r.totalDue, 103_967.74);
  });
});

describe("computeDailyInterestLoan — rounding and determinism", () => {
  it("rounds once: totalDue = round(principal + RAW interest), not round(principal + rounded interest)", () => {
    const principal = 100_000;
    const monthlyRate = 0.03;
    const r = computeDailyInterestLoan({
      principal,
      monthlyRate,
      releaseDate: new Date("2026-07-10"),
      paymentDate: new Date("2026-07-15"),
    });
    const divisor = 31;
    const days = 5;
    const raw = (principal * monthlyRate) / divisor * days; // 483.8709677…
    // totalDue is derived from the un-rounded interest
    const expectedTotal =
      Math.round(Math.round((principal + raw) * 1000) / 10) / 100;
    assert.equal(r.totalDue, expectedTotal);
  });

  it("depends only on the two dates, not on anything ambient", () => {
    const args = {
      principal: 100_000,
      monthlyRate: 0.03,
      releaseDate: new Date("2026-02-25"),
      paymentDate: new Date("2026-03-05"),
    } as const;
    assert.deepEqual(computeDailyInterestLoan(args), computeDailyInterestLoan(args));
  });
});

describe("computeDailyInterestLoan — guard", () => {
  it("rejects a payment date on or before the release date", () => {
    assert.throws(
      () =>
        computeDailyInterestLoan({
          principal: 100_000,
          monthlyRate: 0.03,
          releaseDate: new Date("2026-07-10"),
          paymentDate: new Date("2026-07-10"),
        }),
      /Payment date must be after release date/,
    );
    assert.throws(
      () =>
        computeDailyInterestLoan({
          principal: 100_000,
          monthlyRate: 0.03,
          releaseDate: new Date("2026-07-10"),
          paymentDate: new Date("2026-07-09"),
        }),
      /Payment date must be after release date/,
    );
  });
});
