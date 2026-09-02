import { describe, expect, it } from "vitest";
import {
  generateAmortizationSchedule,
  generateBiMonthlySchedule,
  generateQuarterlySchedule,
  generateTwoMonthlySchedule,
} from "../schedule";

describe("generateAmortizationSchedule — month-overflow bug fix (2026-08-30)", () => {
  it("clamps to Feb 28 instead of overflowing to March when the anchor day is the 30th", () => {
    // Regression guard for the live repro: Sep 30 first payment, 6th
    // installment (index 5) must land on Feb 28, 2027, not March 2.
    const result = generateAmortizationSchedule({
      terms: 6,
      monthlyAmortization: 21_633.33,
      releaseDate: "2026-08-30",
      addonMonths: 0,
      firstPaymentDate: "2026-09-30",
      totalLoan: 129_800,
    });

    expect(result).toHaveLength(6);
    expect(result[0].dueDate).toBe("2026-09-30");
    expect(result[1].dueDate).toBe("2026-10-30");
    expect(result[2].dueDate).toBe("2026-11-30");
    expect(result[3].dueDate).toBe("2026-12-30");
    expect(result[4].dueDate).toBe("2027-01-30");
    expect(result[5].dueDate).toBe("2027-02-28"); // not 2027-03-02
  });

  it("clamps to Feb 29 in a leap year", () => {
    const result = generateAmortizationSchedule({
      terms: 6,
      monthlyAmortization: 10_000,
      releaseDate: "2027-08-31",
      addonMonths: 0,
      firstPaymentDate: "2027-09-30",
      totalLoan: 60_000,
    });

    expect(result[5].dueDate).toBe("2028-02-29");
  });
});

describe("generateBiMonthlySchedule", () => {
  it("generates 12 installments for 6-month term", () => {
    const result = generateBiMonthlySchedule({
      terms: 6,
      monthlyAmortization: 20_000,
      releaseDate: new Date("2026-09-01"),
      totalLoan: 120_000,
    });

    expect(result).toHaveLength(12); // 6 months × 2
    expect(result[0].dueDate).toBe("2026-09-16"); // release + 15
    expect(result[1].dueDate).toBe("2026-10-01"); // release + 30
    expect(result[11].dueDate).toBe("2027-02-28"); // release + 180
  });

  it("splits monthly amount in half", () => {
    const result = generateBiMonthlySchedule({
      terms: 6,
      monthlyAmortization: 20_000,
      releaseDate: new Date("2026-09-01"),
    });

    // Each installment is half of monthly (with rounding)
    expect(result[0].amountDue).toBe(10_000); // halfUp(20000 / 2)
  });

  it("adjusts last installment for total loan", () => {
    const result = generateBiMonthlySchedule({
      terms: 6,
      monthlyAmortization: 20_000,
      releaseDate: new Date("2026-09-01"),
      totalLoan: 120_000,
    });

    const total = result.reduce((sum, row) => sum + row.amountDue, 0);
    expect(total).toBe(120_000);
  });
});

describe("generateQuarterlySchedule", () => {
  it("generates 8 installments for 12-month term (dual-line)", () => {
    const result = generateQuarterlySchedule({
      terms: 12,
      totalLoan: 120_000,
      totalInterest: 10_000,
      releaseDate: new Date("2026-09-01"),
      dueDay: 10,
    });

    expect(result).toHaveLength(8); // 4 quarters x 2 lines

    // Q1
    expect(result[0].dueDate).toBe("2026-12-10");
    expect(result[0].lineType).toBe("interest");
    expect(result[0].amountDue).toBe(2_500);

    expect(result[1].dueDate).toBe("2026-12-10");
    expect(result[1].lineType).toBe("principal");
    expect(result[1].amountDue).toBe(27_500);

    // Q4
    expect(result[6].dueDate).toBe("2027-09-10");
    expect(result[6].lineType).toBe("interest");
    expect(result[6].amountDue).toBe(2_500);

    expect(result[7].dueDate).toBe("2027-09-10");
    expect(result[7].lineType).toBe("principal");
    expect(result[7].amountDue).toBe(27_500);
  });

  it("supports a 6-month term (terms divisible by 3, not just 12)", () => {
    const result = generateQuarterlySchedule({
      terms: 6,
      totalLoan: 60_000,
      totalInterest: 5_000,
      releaseDate: new Date("2026-09-01"),
      dueDay: 10,
    });

    expect(result).toHaveLength(4); // 2 quarters x 2 lines

    expect(result[0].dueDate).toBe("2026-12-10");
    expect(result[0].lineType).toBe("interest");
    expect(result[0].amountDue).toBe(2_500);
    expect(result[1].lineType).toBe("principal");
    expect(result[1].amountDue).toBe(27_500);

    expect(result[2].dueDate).toBe("2027-03-10");
    expect(result[2].lineType).toBe("interest");
    expect(result[2].amountDue).toBe(2_500);
    expect(result[3].lineType).toBe("principal");
    expect(result[3].amountDue).toBe(27_500);

    const total = result.reduce((sum, row) => sum + row.amountDue, 0);
    expect(total).toBe(60_000);
  });

  it("rejects terms not divisible by 3", () => {
    expect(() => {
      generateQuarterlySchedule({
        terms: 7,
        totalLoan: 120_000,
        totalInterest: 10_000,
        releaseDate: new Date("2026-09-01"),
      });
    }).toThrow("Quarterly loans require terms divisible by 3");
  });

  it("does not skip a month when the release day overflows the target month (month-skip bug fix, 2026-08-30)", () => {
    // Regression guard for the live repro: release Aug 31 + 3 months used to
    // overflow "Nov 31" into Dec 1 before dueDay got applied, landing a full
    // month late on Dec 10 instead of the correct Nov 10.
    const result = generateQuarterlySchedule({
      terms: 6,
      totalLoan: 129_800,
      totalInterest: 19_800,
      releaseDate: new Date(2026, 7, 31), // Aug 31, 2026
      dueDay: 10,
    });

    expect(result[0].dueDate).toBe("2026-11-10"); // not 2026-12-10
    expect(result[2].dueDate).toBe("2027-02-10");
  });
});

describe("generateTwoMonthlySchedule", () => {
  it("generates 12 installments for 12-month term (dual-line)", () => {
    const result = generateTwoMonthlySchedule({
      terms: 12,
      totalLoan: 120_000,
      totalInterest: 10_000,
      releaseDate: new Date("2026-09-01"),
      dueDay: 10,
    });

    expect(result).toHaveLength(12); // 6 payments x 2 lines

    // Payment 1
    expect(result[0].dueDate).toBe("2026-11-10");
    expect(result[0].lineType).toBe("interest");
    expect(result[0].amountDue).toBe(1666.67); // 10000 / 6

    expect(result[1].dueDate).toBe("2026-11-10");
    expect(result[1].lineType).toBe("principal");
    expect(result[1].amountDue).toBe(18333.33); // (120000 / 6) - 1666.67

    // Payment 6 (last)
    expect(result[10].dueDate).toBe("2027-09-10");
    expect(result[10].lineType).toBe("interest");
    expect(result[10].amountDue).toBe(1666.67);

    expect(result[11].dueDate).toBe("2027-09-10");
    expect(result[11].lineType).toBe("principal");
    expect(result[11].amountDue).toBe(18333.35); // rounding diff applied
  });

  it("supports a 4-month term (terms divisible by 2, not just 12)", () => {
    const result = generateTwoMonthlySchedule({
      terms: 4,
      totalLoan: 40_000,
      totalInterest: 2_000,
      releaseDate: new Date("2026-09-01"),
      dueDay: 10,
    });

    expect(result).toHaveLength(4); // 2 payments x 2 lines

    expect(result[0].dueDate).toBe("2026-11-10");
    expect(result[0].lineType).toBe("interest");
    expect(result[0].amountDue).toBe(1_000);
    expect(result[1].lineType).toBe("principal");
    expect(result[1].amountDue).toBe(19_000);

    expect(result[2].dueDate).toBe("2027-01-10");
    expect(result[2].lineType).toBe("interest");
    expect(result[2].amountDue).toBe(1_000);
    expect(result[3].lineType).toBe("principal");
    expect(result[3].amountDue).toBe(19_000);

    const total = result.reduce((sum, row) => sum + row.amountDue, 0);
    expect(total).toBe(40_000);
  });

  it("rejects terms not divisible by 2", () => {
    expect(() => {
      generateTwoMonthlySchedule({
        terms: 5,
        totalLoan: 120_000,
        totalInterest: 10_000,
        releaseDate: new Date("2026-09-01"),
      });
    }).toThrow("Two-monthly loans require terms divisible by 2");
  });

  it("does not skip a month when the release day overflows the target month (month-skip bug fix, 2026-08-30)", () => {
    // Third payment (offset 6 months from an Aug 31 release) used to
    // overflow "Feb 31" into March 3 before dueDay got applied, landing a
    // full month late on Mar 10 instead of the correct Feb 10.
    const result = generateTwoMonthlySchedule({
      terms: 6,
      totalLoan: 129_800,
      totalInterest: 19_800,
      releaseDate: new Date(2026, 7, 31), // Aug 31, 2026
      dueDay: 10,
    });

    expect(result[0].dueDate).toBe("2026-10-10");
    expect(result[2].dueDate).toBe("2026-12-10");
    expect(result[4].dueDate).toBe("2027-02-10"); // not 2027-03-10
  });
});
