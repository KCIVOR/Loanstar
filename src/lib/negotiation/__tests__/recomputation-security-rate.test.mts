import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { committeeAdjustPreDecision, lraRecomputeComputation } from "../service";
import { halfUp } from "@/lib/computation/money";
import type { InputMode } from "@/lib/computation/types";

import { database } from "./fixtures/recomputation-database";

const input = (mode: InputMode = "PRINCIPAL") => ({
  loanTypeId: "new-type", inputMode: mode, amount: 201100,
  terms: 4, addonMonths: 0, dueDay: 15, releaseDate: "2026-12-12",
});

for (const [role, recompute] of [["LRA", lraRecomputeComputation], ["Committee", committeeAdjustPreDecision]] as const) {
  describe(`${role} Seafarer security rate`, () => {
    for (const [label, oldRate, newRate] of [
      ["decrease", 0.0199, 0.0175], ["increase", 0.0175, 0.0225],
      ["unchanged", 0.0199, 0.0199], ["repair stale zero", 0, 0.0175],
      ["zero current rate", 0.0199, 0], ["missing prior rate", null, 0.0175],
    ] as const) {
      it(`${label}: uses the current loan type for both interest and security`, async () => {
        const db = database("seafarer", oldRate, newRate);
        const { computation } = await recompute(db.client, "app", "actor", input());
        assert.equal(computation.interestRate, newRate);
        assert.equal(computation.securityFeeRate, newRate);
        assert.equal(computation.securityFee, halfUp(201100 * newRate));
        assert.equal(computation.principal, 201100);
        assert.equal((db.row().other_deductions as { accountOpening: number }).accountOpening, 100);
        assert.equal(computation.releaseDate, "2026-12-12");
        assert.equal(computation.netReleased, halfUp(computation.principal - computation.totalDeductions));
      });
    }
    for (const mode of ["NET_SARADO", "NET_LESS_SECURITY"] as const) {
      it(`${mode}: re-solves principal and applies the current security rate`, async () => {
        const db = database("seafarer", 0.0225, 0.0175);
        const { computation: c } = await recompute(db.client, "app", "actor", input(mode));
        assert.equal(c.securityFeeRate, 0.0175);
        assert.equal(c.securityFee, halfUp(c.principal * 0.0175));
        assert.ok(Math.abs((mode === "NET_SARADO" ? c.netReleased : c.netReleased + c.securityFee) - 201100) <= 0.01);
      });
    }
    it("supports the first computation with no prior snapshot", async () => {
      const db = database("seafarer", null, 0.0175, false);
      const { computation: c } = await recompute(db.client, "app", "actor", input());
      assert.equal(c.securityFeeRate, 0.0175);
      assert.equal(c.securityFee, 3519.25);
    });
    it("rounds the report's pictured principal at the corrected 1.75% rate", async () => {
      const db = database("seafarer", 0.0225, 0.0175);
      const { computation: c } = await recompute(db.client, "app", "actor", {
        ...input(), amount: 67979.34, addonMonths: 2,
      });
      assert.equal(c.securityFee, 1189.64);
      assert.equal(c.securityFeeRate, 0.0175);
    });
    for (const segment of ["sme", "individual"] as const) {
      it(`${segment}: retains custom interest and no-security behavior`, async () => {
        const db = database(segment, 0.031, 0.0175);
        const { computation: c } = await recompute(db.client, "app", "actor", { ...input(), interestRate: 0.025 });
        assert.equal(c.interestRate, 0.025);
        assert.equal(c.securityFeeRate, 0);
        assert.equal(c.securityFee, 0);
      });
    }
  });
}
