import { describe, expect, it } from "vitest";
import { buildDiscountUnits, maxDiscountUnits } from "../discount-units";

describe("maxDiscountUnits", () => {
  it("Monthly: one unit per term", () => {
    expect(maxDiscountUnits("monthly", 6)).toBe(6);
    expect(maxDiscountUnits(undefined, 6)).toBe(6);
  });

  it("Salary/Bi-Monthly: one unit per real payment — terms * 2, not terms (per-payment discount, confirmed 2026-08-31)", () => {
    expect(maxDiscountUnits("semi_monthly", 6)).toBe(12);
    expect(maxDiscountUnits("bi_monthly", 6)).toBe(12);
    expect(maxDiscountUnits("semi_monthly", 3)).toBe(6);
  });

  it("Invoice: one unit per real weekly payment — terms * 4, not terms (per-payment discount, confirmed 2026-08-31)", () => {
    expect(maxDiscountUnits("weekly", 3)).toBe(12);
    expect(maxDiscountUnits("weekly", 1)).toBe(4);
  });

  it("Quarterly: terms / 3, not terms", () => {
    expect(maxDiscountUnits("quarterly", 12)).toBe(4);
    expect(maxDiscountUnits("quarterly", 6)).toBe(2);
  });

  it("Two-monthly: terms / 2, not terms", () => {
    expect(maxDiscountUnits("two_monthly", 4)).toBe(2);
  });

  it("Quarterly Special / Two-monthly Special: same unit count as their non-special counterparts", () => {
    expect(maxDiscountUnits("quarterly_special", 12)).toBe(4);
    expect(maxDiscountUnits("quarterly_special", 6)).toBe(2);
    expect(maxDiscountUnits("two_monthly_special", 4)).toBe(2);
  });

  it("Daily: zero — nothing to discount", () => {
    expect(maxDiscountUnits("daily", 1)).toBe(0);
  });
});

describe("buildDiscountUnits — Invoice (weekly), one unit per real payment (confirmed 2026-08-31)", () => {
  it("12 real weekly units for a 3-month loan, each its own real interest amount, excludes the final principal row", () => {
    const units = buildDiscountUnits({
      paymentFrequency: "weekly",
      terms: 3,
      principal: 100_000,
      totalInterest: 22_000,
      totalLoan: 122_000,
      releaseDate: new Date("2026-09-01"),
    });

    expect(units).toHaveLength(12); // 3 months x 4 real weekly payments
    expect(units[0].label).toBe("Week 1");
    expect(units[0].interestAmount).toBe(1_000); // 1% of 100,000
    expect(units[0].installmentNos).toEqual([1]);
    expect(units[3].interestAmount).toBe(1_000); // week 4, still 1%
    expect(units[4].label).toBe("Week 5");
    expect(units[4].interestAmount).toBe(2_000); // 2% of 100,000
    expect(units[8].label).toBe("Week 9");
    expect(units[8].interestAmount).toBe(2_500); // 2.5% of 100,000
    expect(units[11].interestAmount).toBe(2_500); // week 12, still 2.5%
    // Installment 13 (the final principal row) never appears as its own unit.
    const allInstallmentNos = units.flatMap((u) => u.installmentNos);
    expect(allInstallmentNos).not.toContain(13);
    expect(allInstallmentNos).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("maxDiscountUnits and buildDiscountUnits agree on unit count", () => {
    const units = buildDiscountUnits({
      paymentFrequency: "weekly",
      terms: 3,
      principal: 100_000,
      totalInterest: 22_000,
      totalLoan: 122_000,
      releaseDate: new Date("2026-09-01"),
    });
    expect(units).toHaveLength(maxDiscountUnits("weekly", 3));
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

describe("buildDiscountUnits — Quarterly Special / Two-monthly Special", () => {
  it("Quarterly Special: same unit count/interest/dates as regular Quarterly — the $0 principal placeholder rows never become units", () => {
    const units = buildDiscountUnits({
      paymentFrequency: "quarterly_special",
      terms: 6,
      principal: 55_000,
      totalInterest: 5_000,
      totalLoan: 60_000,
      releaseDate: new Date("2026-09-01"),
      dueDay: 10,
    });

    expect(units).toHaveLength(2); // 6 / 3
    expect(units[0].label).toBe("Quarter 1 (Special)");
    expect(units[0].interestAmount).toBe(2_500);
    expect(units[0].installmentNos).toHaveLength(1); // interest row only
    expect(units[1].label).toBe("Quarter 2 (Special)");
  });

  it("Two-monthly Special: same unit count/interest/dates as regular Two-monthly", () => {
    const units = buildDiscountUnits({
      paymentFrequency: "two_monthly_special",
      terms: 4,
      principal: 38_000,
      totalInterest: 2_000,
      totalLoan: 40_000,
      releaseDate: new Date("2026-09-01"),
      dueDay: 10,
    });

    expect(units).toHaveLength(2); // 4 / 2
    expect(units[0].label).toBe("Payment 1 (Special)");
    expect(units[0].interestAmount).toBe(1_000);
  });

  it("maxDiscountUnits and buildDiscountUnits agree on unit count for both Special variants", () => {
    const quarterlySpecialUnits = buildDiscountUnits({
      paymentFrequency: "quarterly_special",
      terms: 12,
      principal: 168_300,
      totalInterest: 70_686,
      totalLoan: 238_986,
      releaseDate: new Date("2026-09-04"),
      dueDay: 10,
    });
    expect(quarterlySpecialUnits).toHaveLength(maxDiscountUnits("quarterly_special", 12));

    const twoMonthlySpecialUnits = buildDiscountUnits({
      paymentFrequency: "two_monthly_special",
      terms: 12,
      principal: 168_300,
      totalInterest: 70_686,
      totalLoan: 238_986,
      releaseDate: new Date("2026-09-04"),
      dueDay: 10,
    });
    expect(twoMonthlySpecialUnits).toHaveLength(maxDiscountUnits("two_monthly_special", 12));
    // Regression for the live AN300445 numbers: 6 payments, ₱11,781 interest each.
    expect(twoMonthlySpecialUnits).toHaveLength(6);
    expect(twoMonthlySpecialUnits[0].interestAmount).toBe(11_781);
  });
});

describe("buildDiscountUnits — Bi-Monthly / Salary (one unit per real payment, confirmed 2026-08-31)", () => {
  it("Bi-Monthly: terms * 2 units, one real row each, flat interest split evenly across all real payments", () => {
    const units = buildDiscountUnits({
      paymentFrequency: "bi_monthly",
      terms: 6,
      principal: 100_000,
      totalInterest: 20_000,
      totalLoan: 120_000,
      releaseDate: new Date("2026-09-01"),
    });

    expect(units).toHaveLength(12); // 6 months x 2 real payments
    expect(units[0].label).toBe("Payment 1");
    expect(units[0].dueDate).toBe("2026-09-16"); // release + 15
    expect(units[0].interestAmount).toBeCloseTo(20_000 / 12, 2);
    expect(units[0].installmentNos).toEqual([1]);
    expect(units[11].dueDate).toBe("2027-02-28"); // release + 180
    expect(units[11].installmentNos).toEqual([12]);
  });

  it("Salary (semi_monthly): terms * 2 units, one real row each, real alternating 15th/end-of-month dates", () => {
    const units = buildDiscountUnits({
      paymentFrequency: "semi_monthly",
      terms: 3,
      principal: 60_000,
      totalInterest: 6_000,
      totalLoan: 66_000,
      releaseDate: new Date("2026-09-01"),
      firstPaymentDate: "2026-09-15",
    });

    expect(units).toHaveLength(6); // 3 months x 2 real payments
    expect(units[0].label).toBe("Payment 1");
    expect(units[0].dueDate).toBe("2026-09-15");
    expect(units[1].dueDate).toBe("2026-09-30");
    expect(units[2].dueDate).toBe("2026-10-15");
    expect(units[3].dueDate).toBe("2026-10-31");
    expect(units[4].dueDate).toBe("2026-11-15");
    expect(units[5].dueDate).toBe("2026-11-30");
    for (const unit of units) {
      expect(unit.interestAmount).toBeCloseTo(6_000 / 6, 2);
      expect(unit.installmentNos).toHaveLength(1);
    }
  });

  it("Salary: returns no units when firstPaymentDate isn't available yet (no anchor to derive real dates from)", () => {
    const units = buildDiscountUnits({
      paymentFrequency: "semi_monthly",
      terms: 3,
      principal: 60_000,
      totalInterest: 6_000,
      totalLoan: 66_000,
      releaseDate: new Date("2026-09-01"),
    });

    expect(units).toHaveLength(0);
  });

  it("maxDiscountUnits and buildDiscountUnits agree on unit count", () => {
    const biMonthlyUnits = buildDiscountUnits({
      paymentFrequency: "bi_monthly",
      terms: 6,
      principal: 100_000,
      totalInterest: 20_000,
      totalLoan: 120_000,
      releaseDate: new Date("2026-09-01"),
    });
    expect(biMonthlyUnits).toHaveLength(maxDiscountUnits("bi_monthly", 6));

    const salaryUnits = buildDiscountUnits({
      paymentFrequency: "semi_monthly",
      terms: 3,
      principal: 60_000,
      totalInterest: 6_000,
      totalLoan: 66_000,
      releaseDate: new Date("2026-09-01"),
      firstPaymentDate: "2026-09-15",
    });
    expect(salaryUnits).toHaveLength(maxDiscountUnits("semi_monthly", 3));
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

  it("Monthly: clamps to Feb 28 instead of overflowing to March (month-overflow bug fix, 2026-08-30)", () => {
    const units = buildDiscountUnits({
      paymentFrequency: "monthly",
      terms: 6,
      principal: 110_000,
      totalInterest: 19_800,
      totalLoan: 129_800,
      releaseDate: new Date("2026-08-30"),
      firstPaymentDate: "2026-09-30",
    });

    expect(units[5].dueDate).toBe("2027-02-28"); // not 2027-03-02
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
