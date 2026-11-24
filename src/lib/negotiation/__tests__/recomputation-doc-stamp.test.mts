import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { persistComputation } from "@/lib/csa/computation";
import { committeeAdjustPreDecision, lraRecomputeComputation } from "../service";
import { database } from "./fixtures/recomputation-database";
import type { InputMode } from "@/lib/computation/types";

const input = {
  loanTypeId: "new-type", inputMode: "PRINCIPAL" as const, amount: 100000,
  terms: 4, addonMonths: 0, dueDay: 15, releaseDate: "2026-01-15",
};
type CaseInput = Omit<typeof input, "inputMode"> & { inputMode: InputMode };

const compute = {
  CSA: (db: ReturnType<typeof database>, values: CaseInput) => persistComputation(db.client, {
    ...values, loanApplicationId: "app", segment: "seafarer", pfRate: 0.08,
    interestRate: 0.0199, securityFeeRate: 0.0199, computedBy: "actor",
  }),
  Committee: (db: ReturnType<typeof database>, values: CaseInput) => committeeAdjustPreDecision(db.client, "app", "actor", values),
  LRA: (db: ReturnType<typeof database>, values: CaseInput) => lraRecomputeComputation(db.client, "app", "actor", values),
};

for (const [role, run] of Object.entries(compute)) {
  describe(`${role} documentary stamp`, () => {
    it("prorates the report's 100,000 / 90-day example and preserves the PF bundle", async () => {
      const db = database("seafarer", 0.0199, 0.0199);
      const { computation: c, result } = await run(db, input);
      assert.equal(c.docStamp, 184.93);
      assert.equal(c.lineItems.find(x => x.key === "doc_stamp")?.amount, 184.93);
      assert.equal(Math.round((c.processingFee + c.docStamp + c.notaryFee + c.adminCost) * 100), Math.round(result.pfBundle * 100));
      assert.equal(c.firstPaymentDate, "2026-01-15");
    });
    for (const [days, releaseDate, terms, expected] of [
      [364, "2026-01-16", 12, 747.95],
      [365, "2026-01-15", 12, 750],
      [366, "2024-01-15", 12, 750],
    ] as const) {
      it(`${days} actual days: ${expected} stamp at the year boundary`, async () => {
        const db = database("seafarer", 0.0199, 0.0199);
        const { computation: c } = await run(db, { ...input, releaseDate, terms, addonMonths: 1 });
        assert.equal(c.docStamp, expected);
      });
    }
    it("includes add-on months and the client's release-to-final-payment dates", async () => {
      const db = database("seafarer", 0.0199, 0.0199);
      const { computation: c } = await run(db, { ...input, amount: 111340, releaseDate: "2026-07-20", terms: 6, addonMonths: 2 });
      assert.equal(c.firstPaymentDate, "2026-09-15");
      assert.equal(c.docStamp, 480.44);
    });
    for (const mode of ["NET_SARADO", "NET_LESS_SECURITY"] as const) {
      it(`${mode}: prorates the solved principal without changing the fixed PF bundle target`, async () => {
        const db = database("seafarer", 0.0199, 0.0199);
        const { computation: c } = await run(db, { ...input, inputMode: mode });
        assert.equal(c.docStamp, Math.round(c.principal * 0.0075 * 90 / 365 * 100) / 100);
        assert.ok(Math.abs((mode === "NET_SARADO" ? c.netReleased : c.netReleased + c.securityFee) - 100000) <= 0.01);
      });
    }
    it("includes the 22nd cutoff through the actual final payment date", async () => {
      const db = database("seafarer", 0.0199, 0.0199);
      const { computation: c } = await run(db, { ...input, releaseDate: "2026-07-22" });
      assert.equal(c.firstPaymentDate, "2026-08-15");
      assert.equal(c.docStamp, 238.36);
    });
  });
}

for (const segment of ["sme", "individual"] as const) {
  it(`${segment}: preserves the workbook's default full-year stamp`, async () => {
    const db = database(segment, 0.0199, 0.0199);
    const { computation: c } = await persistComputation(db.client, {
      ...input, segment, loanApplicationId: "app", pfRate: 0.08, interestRate: 0.0199,
      securityFeeRate: 0, computedBy: "actor",
    });
    assert.equal(c.docStamp, 810);
  });
  it(`${segment}: preserves No DS & Notary`, async () => {
    const db = database(segment, 0.0199, 0.0199);
    const { computation: c } = await persistComputation(db.client, {
      ...input, segment, loanApplicationId: "app", pfRate: 0.08, interestRate: 0.0199,
      securityFeeRate: 0, computedBy: "actor", withDsAndNotary: false,
    });
    assert.equal(c.docStamp, 0);
    assert.equal(c.notaryFee, 0);
  });
}
