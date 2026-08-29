import { describe, expect, it } from "vitest";
import {
  generateBiMonthlySchedule,
  generateQuarterlySchedule,
  generateTwoMonthlySchedule,
} from "../schedule";

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
});
