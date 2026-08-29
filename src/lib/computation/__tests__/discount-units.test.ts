import { describe, expect, it } from "vitest";
import { buildDiscountUnits, maxDiscountUnits } from "../discount-units";

describe("maxDiscountUnits", () => {
  it("Monthly/Salary/Bi-Monthly: one unit per term", () => {
    expect(maxDiscountUnits("monthly", 6)).toBe(6);
    expect(maxDiscountUnits("semi_monthly", 6)).toBe(6);
    expect(maxDiscountUnits("bi_monthly", 6)).toBe(6);
    expect(maxDiscountUnits(undefined, 6)).toBe(6);
  });

  it("Invoice: one unit per term (per invoice month)", () => {
    expect(maxDiscountUnits("weekly", 3)).toBe(3);
  });

  it("Quarterly: terms / 3, not terms", () => {
    expect(maxDiscountUnits("quarterly", 12)).toBe(4);
    expect(maxDiscountUnits("quarterly", 6)).toBe(2);
  });

  it("Two-monthly: terms / 2, not terms", () => {
    expect(maxDiscountUnits("two_monthly", 4)).toBe(2);
  });

  it("Daily: zero — nothing to discount", () => {
    expect(maxDiscountUnits("daily", 1)).toBe(0);
  });
});

describe("buildDiscountUnits — Invoice (weekly)", () => {
  it("groups the 12 weekly rows into 3 real months with the true escalating totals, excludes the final principal row", () => {
    const units = buildDiscountUnits({
      paymentFrequency: "weekly",
      terms: 3,
      principal: 100_000,
      totalInterest: 22_000,
      totalLoan: 122_000,
      releaseDate: new Date("2026-09-01"),
    });

    expect(units).toHaveLength(3);
    expect(units[0].interestAmount).toBe(4_000); // 4 weeks × 1%
    expect(units[0].installmentNos).toEqual([1, 2, 3, 4]);
    expect(units[1].interestAmount).toBe(8_000); // 4 weeks × 2%
    expect(units[1].installmentNos).toEqual([5, 6, 7, 8]);
    expect(units[2].interestAmount).toBe(10_000); // 4 weeks × 2.5%
    expect(units[2].installmentNos).toEqual([9, 10, 11, 12]);
    // Installment 13 (the final principal row) never appears in any unit.
    const allInstallmentNos = units.flatMap((u) => u.installmentNos);
    expect(allInstallmentNos).not.toContain(13);
  });
});

describe("buildDiscountUnits — Quarterly / Two-monthly", () => {
  it("Quarterly: one unit per real due date, targeting only the interest row (never the principal row)", () => {
    const units = buildDiscountUnits({
      paymentFrequency: "quarterly",
      terms: 6,
      principal: 55_000,
      totalInterest: 5_000,
      totalLoan: 60_000,
      releaseDate: new Date("2026-09-01"),
      dueDay: 10,
    });

    expect(units).toHaveLength(2); // 6 / 3
    expect(units[0].label).toBe("Quarter 1");
    expect(units[0].interestAmount).toBe(2_500);
    expect(units[0].installmentNos).toHaveLength(1); // interest row only
    expect(units[1].label).toBe("Quarter 2");
  });

  it("Two-monthly: one unit per real due date, terms/2 units", () => {
    const units = buildDiscountUnits({
      paymentFrequency: "two_monthly",
      terms: 4,
      principal: 38_000,
      totalInterest: 2_000,
      totalLoan: 40_000,
      releaseDate: new Date("2026-09-01"),
      dueDay: 10,
    });

    expect(units).toHaveLength(2); // 4 / 2
    expect(units[0].label).toBe("Payment 1");
    expect(units[0].interestAmount).toBe(1_000);
  });
});

describe("buildDiscountUnits — Bi-Monthly / Salary", () => {
  it("Bi-Monthly: terms units, each covering 2 real rows, flat interest split evenly", () => {
    const units = buildDiscountUnits({
      paymentFrequency: "bi_monthly",
      terms: 6,
      principal: 100_000,
      totalInterest: 20_000,
      totalLoan: 120_000,
      releaseDate: new Date("2026-09-01"),
    });

    expect(units).toHaveLength(6);
    expect(units[0].interestAmount).toBeCloseTo(20_000 / 6, 2);
    expect(units[0].installmentNos).toEqual([1, 2]);
    expect(units[5].installmentNos).toEqual([11, 12]);
  });

  it("Salary (semi_monthly): same 2-rows-per-unit pattern as Bi-Monthly", () => {
    const units = buildDiscountUnits({
      paymentFrequency: "semi_monthly",
      terms: 3,
      principal: 60_000,
      totalInterest: 6_000,
      totalLoan: 66_000,
      releaseDate: new Date("2026-09-01"),
      firstPaymentDate: "2026-09-15",
    });

    expect(units).toHaveLength(3);
    expect(units[0].installmentNos).toEqual([1, 2]);
    expect(units[1].installmentNos).toEqual([3, 4]);
  });
});

describe("buildDiscountUnits — Monthly (default) and Daily", () => {
  it("Monthly: terms units, one real row each, flat interest split", () => {
    const units = buildDiscountUnits({
      paymentFrequency: "monthly",
      terms: 6,
      principal: 110_000,
      totalInterest: 19_800,
      totalLoan: 129_800,
      releaseDate: new Date("2026-09-01"),
      firstPaymentDate: "2026-10-01",
    });

    expect(units).toHaveLength(6);
    expect(units[0].installmentNos).toEqual([1]);
    expect(units[0].interestAmount).toBeCloseTo(19_800 / 6, 2);
  });

  it("Daily: no units at all — a single already-fixed payment has nothing to discount", () => {
    const units = buildDiscountUnits({
      paymentFrequency: "daily",
      terms: 1,
      principal: 100_000,
      totalInterest: 500,
      totalLoan: 100_500,
      releaseDate: new Date("2026-08-20"),
      firstPaymentDate: "2026-08-25",
    });

    expect(units).toHaveLength(0);
  });
});
