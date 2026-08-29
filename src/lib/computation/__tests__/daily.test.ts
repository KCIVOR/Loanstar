import { describe, expect, it } from "vitest";
import { computeDailyInterestLoan } from "../daily";

describe("computeDailyInterestLoan", () => {
  it("matches the worked example: 5 days, 3% monthly, ₱100,000 → ₱500 interest", () => {
    const result = computeDailyInterestLoan({
      principal: 100_000,
      monthlyRate: 0.03,
      releaseDate: new Date("2026-08-20"),
      paymentDate: new Date("2026-08-25"),
    });

    expect(result.days).toBe(5);
    expect(result.dailyRate).toBeCloseTo(0.001, 10);
    expect(result.interest).toBe(500);
    expect(result.totalDue).toBe(100_500);
  });

  it("matches the second worked example: 7 days → ₱700 interest", () => {
    const result = computeDailyInterestLoan({
      principal: 100_000,
      monthlyRate: 0.03,
      releaseDate: new Date("2026-08-20"),
      paymentDate: new Date("2026-08-27"),
    });

    expect(result.days).toBe(7);
    expect(result.interest).toBe(700);
    expect(result.totalDue).toBe(100_700);
  });

  it("produces a single payment, never a recurring schedule", () => {
    const result = computeDailyInterestLoan({
      principal: 100_000,
      monthlyRate: 0.03,
      releaseDate: new Date("2026-08-20"),
      paymentDate: new Date("2026-08-25"),
    });

    // The whole point of Daily Interest — one number, not a schedule array.
    expect(typeof result.totalDue).toBe("number");
    expect(result.principal).toBe(100_000);
  });

  it("rejects a payment date on or before the release date", () => {
    expect(() =>
      computeDailyInterestLoan({
        principal: 100_000,
        monthlyRate: 0.03,
        releaseDate: new Date("2026-08-20"),
        paymentDate: new Date("2026-08-20"),
      }),
    ).toThrow("Payment date must be after release date");

    expect(() =>
      computeDailyInterestLoan({
        principal: 100_000,
        monthlyRate: 0.03,
        releaseDate: new Date("2026-08-20"),
        paymentDate: new Date("2026-08-19"),
      }),
    ).toThrow("Payment date must be after release date");
  });
});
