import assert from "node:assert/strict";
import { it } from "node:test";
import { persistComputation } from "@/lib/csa/computation";
import { committeeAdjustPreDecision, lraRecomputeComputation } from "../service";
import { database } from "./fixtures/recomputation-database";
import { generateAmortizationSchedule } from "@/lib/ar/schedule";
import { addScheduleMonths } from "@/lib/computation/release-date";
import { buildDiscountUnits } from "@/lib/computation/discount-units";

for (const role of ["CSA", "Committee", "LRA"]) {
  for (const [releaseDate, dueDay, addonMonths, expectedDates] of [
    ["2026-01-20", 10, 1, ["2026-02-10", "2026-03-10", "2026-04-10"]],
    ["2026-01-22", 10, 1, ["2026-03-10", "2026-04-10", "2026-05-10"]],
    ["2026-01-20", 31, 1, ["2026-02-28", "2026-03-31", "2026-04-30"]],
    ["2028-01-20", 31, 1, ["2028-02-29", "2028-03-31", "2028-04-30"]],
    ["2026-12-22", 1, 0, ["2027-01-01", "2027-02-01", "2027-03-01"]],
    ["2026-01-20", 24, 1, ["2026-02-24", "2026-03-24", "2026-04-24"]],
  ] as const) {
    it(`${role}: day ${dueDay}, release ${releaseDate}, including downstream dates`, async () => {
      const db = database("seafarer", 0.0199, 0.0199);
      const input = {loanTypeId:"new-type",inputMode:"PRINCIPAL" as const,amount:100000,terms:3,addonMonths,releaseDate,dueDay};
      const {computation:c} = role === "CSA" ? await persistComputation(db.client, {...input,loanApplicationId:"app",segment:"seafarer",pfRate:0.08,interestRate:0.0199,securityFeeRate:0.0199,computedBy:"actor"})
        : await (role === "Committee" ? committeeAdjustPreDecision : lraRecomputeComputation)(db.client,"app","actor",input);
      assert.equal(c.dueDay,dueDay);
      assert.equal(c.firstPaymentDate,expectedDates[0]);
      const dates = generateAmortizationSchedule({...c,segment:"seafarer",releaseDate,firstPaymentDate:c.firstPaymentDate,dueDay}).map(x=>x.dueDate);
      assert.deepEqual(dates,expectedDates);
      assert.deepEqual(expectedDates.map((_,i)=>addScheduleMonths(c.firstPaymentDate!,i,dueDay,"seafarer")),expectedDates);
      const units=buildDiscountUnits({...c,segment:"seafarer",releaseDate,firstPaymentDate:c.firstPaymentDate,dueDay});
      assert.deepEqual(units.map(x=>x.dueDate),expectedDates);
      const days=(Date.parse(expectedDates[2])-Date.parse(releaseDate))/86400000;
      assert.equal(c.docStamp,Math.round(100000*0.0075*Math.min(days,365)/365*100)/100);
    });
  }
}
it("preserves a segment-specific anchor when its stored generic due day differs",()=>{
  assert.equal(addScheduleMonths("2026-02-28",1,10),"2026-03-28");
  assert.equal(addScheduleMonths("2026-02-12",1,31),"2026-03-12");
});
