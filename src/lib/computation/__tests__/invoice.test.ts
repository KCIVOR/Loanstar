import { describe, it, expect } from "vitest";
import { computeInvoiceLoan } from "../invoice";

describe("computeInvoiceLoan", () => {
  describe("3-month term (full example from transcription)", () => {
    it("generates 12 weekly payments + principal due", () => {
      const result = computeInvoiceLoan({
        principal: 100_000,
        terms: 3,
        releaseDate: new Date("2026-09-01"),
      });

      expect(result.principal).toBe(100_000);
      expect(result.terms).toBe(3);
      expect(result.weeklySchedule).toHaveLength(12);
      expect(result.principalAmount).toBe(100_000);
      expect(result.penaltyAmount).toBe(5_000); // 5% of 100k
    });

    it("calculates correct weekly amounts: 1% → 2% → 2.5%", () => {
      const result = computeInvoiceLoan({
        principal: 100_000,
        terms: 3,
        releaseDate: new Date("2026-09-01"),
      });

      // Month 1: weeks 1-4 at 1% each
      for (let i = 0; i < 4; i++) {
        expect(result.weeklySchedule[i].amountDue).toBe(1_000);
        expect(result.weeklySchedule[i].interestRate).toBe(0.01);
        expect(result.weeklySchedule[i].month).toBe(1);
      }

      // Month 2: weeks 5-8 at 2% each
      for (let i = 4; i < 8; i++) {
        expect(result.weeklySchedule[i].amountDue).toBe(2_000);
        expect(result.weeklySchedule[i].interestRate).toBe(0.02);
        expect(result.weeklySchedule[i].month).toBe(2);
      }

      // Month 3: weeks 9-12 at 2.5% each
      for (let i = 8; i < 12; i++) {
        expect(result.weeklySchedule[i].amountDue).toBe(2_500);
        expect(result.weeklySchedule[i].interestRate).toBe(0.025);
        expect(result.weeklySchedule[i].month).toBe(3);
      }
    });

    it("totals 22% interest over 3 months", () => {
      const result = computeInvoiceLoan({
        principal: 100_000,
        terms: 3,
        releaseDate: new Date("2026-09-01"),
      });

      // 4% + 8% + 10% = 22%
      expect(result.totalInterest).toBe(22_000);
    });

    it("sets principal due 1 week after final interest payment", () => {
      const result = computeInvoiceLoan({
        principal: 100_000,
        terms: 3,
        releaseDate: new Date("2026-09-01"),
      });

      // Release: Sep 1
      // Week 12 (final interest): Sep 1 + 12*7 = Nov 24
      // Principal due: Sep 1 + 13*7 = Dec 1
      expect(result.principalDueDate).toBe("2026-12-01");
    });

    it("generates correct weekly due dates (7 day intervals)", () => {
      const result = computeInvoiceLoan({
        principal: 100_000,
        terms: 3,
        releaseDate: new Date("2026-09-01"),
      });

      // Week 1: Sep 1 + 7 = Sep 8
      expect(result.weeklySchedule[0].dueDate).toBe("2026-09-08");
      expect(result.weeklySchedule[0].weekNo).toBe(1);

      // Week 4: Sep 1 + 28 = Sep 29
      expect(result.weeklySchedule[3].dueDate).toBe("2026-09-29");
      expect(result.weeklySchedule[3].weekNo).toBe(4);

      // Week 12: Sep 1 + 84 = Nov 24
      expect(result.weeklySchedule[11].dueDate).toBe("2026-11-24");
      expect(result.weeklySchedule[11].weekNo).toBe(12);
    });
  });

  describe("2-month term", () => {
    it("generates 8 weekly payments", () => {
      const result = computeInvoiceLoan({
        principal: 50_000,
        terms: 2,
        releaseDate: new Date("2026-09-01"),
      });

      expect(result.weeklySchedule).toHaveLength(8);
      expect(result.terms).toBe(2);
    });

    it("calculates correct interest: 1% + 2% = 12% total", () => {
      const result = computeInvoiceLoan({
        principal: 50_000,
        terms: 2,
        releaseDate: new Date("2026-09-01"),
      });

      // Month 1: 4 weeks × 1% × 50k = 4 × 500 = 2,000
      // Month 2: 4 weeks × 2% × 50k = 4 × 1,000 = 4,000
      // Total: 6,000 (12% of 50k)
      expect(result.totalInterest).toBe(6_000);
    });

    it("sets principal due at week 9", () => {
      const result = computeInvoiceLoan({
        principal: 50_000,
        terms: 2,
        releaseDate: new Date("2026-09-01"),
      });

      // Release: Sep 1
      // Week 8 (final): Sep 1 + 8*7 = Oct 27
      // Principal due: Sep 1 + 9*7 = Nov 3
      expect(result.principalDueDate).toBe("2026-11-03");
    });
  });

  describe("1-month term", () => {
    it("generates 4 weekly payments", () => {
      const result = computeInvoiceLoan({
        principal: 25_000,
        terms: 1,
        releaseDate: new Date("2026-09-01"),
      });

      expect(result.weeklySchedule).toHaveLength(4);
      expect(result.terms).toBe(1);
    });

    it("calculates correct interest: 1% × 4 = 4% total", () => {
      const result = computeInvoiceLoan({
        principal: 25_000,
        terms: 1,
        releaseDate: new Date("2026-09-01"),
      });

      // 4 weeks × 1% × 25k = 4 × 250 = 1,000
      expect(result.totalInterest).toBe(1_000);
    });

    it("sets principal due at week 5", () => {
      const result = computeInvoiceLoan({
        principal: 25_000,
        terms: 1,
        releaseDate: new Date("2026-09-01"),
      });

      // Release: Sep 1
      // Week 4 (final): Sep 1 + 4*7 = Sep 29
      // Principal due: Sep 1 + 5*7 = Oct 6
      expect(result.principalDueDate).toBe("2026-10-06");
    });
  });

  describe("validation", () => {
    it("throws on terms < 1", () => {
      expect(() =>
        computeInvoiceLoan({
          principal: 100_000,
          terms: 0,
          releaseDate: new Date("2026-09-01"),
        }),
      ).toThrow("Invoice financing terms must be 1, 2, or 3 months");
    });

    it("throws on terms > 3", () => {
      expect(() =>
        computeInvoiceLoan({
          principal: 100_000,
          terms: 4,
          releaseDate: new Date("2026-09-01"),
        }),
      ).toThrow("Invoice financing terms must be 1, 2, or 3 months");
    });

    it("throws on non-integer terms", () => {
      expect(() =>
        computeInvoiceLoan({
          principal: 100_000,
          terms: 2.5,
          releaseDate: new Date("2026-09-01"),
        }),
      ).toThrow("Invoice financing terms must be 1, 2, or 3 months");
    });
  });

  describe("half-up rounding", () => {
    it("rounds amounts correctly", () => {
      // halfUp rounds to the nearest CENTAVO (2 decimal places), not the
      // nearest peso — 2.5 is already exact to 2 decimals, so it stays 2.5.
      // 100 × 1% = 1, 100 × 2% = 2, 100 × 2.5% = 2.5.
      const result = computeInvoiceLoan({
        principal: 100,
        terms: 3,
        releaseDate: new Date("2026-09-01"),
      });

      expect(result.weeklySchedule[0].amountDue).toBe(1); // 1% of 100
      expect(result.weeklySchedule[4].amountDue).toBe(2); // 2% of 100
      expect(result.weeklySchedule[8].amountDue).toBe(2.5); // 2.5% of 100
    });

    it("accumulates interest with half-up", () => {
      const result = computeInvoiceLoan({
        principal: 100,
        terms: 3,
        releaseDate: new Date("2026-09-01"),
      });

      // 4×1 + 4×2 + 4×2.5 = 4 + 8 + 10 = 22
      expect(result.totalInterest).toBe(22);
    });

    it("rounds a genuinely fractional-centavo amount up (true half-up case)", () => {
      // 101.5 × 1% = 1.015 — a third decimal digit that halfUp must round:
      // 1.015 → 1.02 (half-up rounds the exact-.5-at-the-third-decimal case
      // up, same convention as the rest of the money.ts module).
      const result = computeInvoiceLoan({
        principal: 101.5,
        terms: 1,
        releaseDate: new Date("2026-09-01"),
      });

      expect(result.weeklySchedule[0].amountDue).toBe(1.02);
    });
  });

  describe("penalty calculation", () => {
    it("calculates 5% penalty (informational)", () => {
      const result = computeInvoiceLoan({
        principal: 100_000,
        terms: 3,
        releaseDate: new Date("2026-09-01"),
      });

      expect(result.penaltyAmount).toBe(5_000); // 5% of 100k
    });

    it("rounds a genuinely fractional-centavo penalty up (true half-up case)", () => {
      // 101.5 × 5% = 5.075 — same third-decimal-.5 case as the weekly
      // amount test above: halfUp rounds 5.075 → 5.08, not truncates to 5.07.
      const result = computeInvoiceLoan({
        principal: 101.5,
        terms: 1,
        releaseDate: new Date("2026-09-01"),
      });

      expect(result.penaltyAmount).toBe(5.08);
    });
  });
});
