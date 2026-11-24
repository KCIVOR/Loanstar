import assert from "node:assert/strict";
import {it} from "node:test";
import {generateAmortizationSchedule} from "../schedule";
import {buildDiscountUnits} from "@/lib/computation/discount-units";

for (const segment of ["sme","individual"] as const) {
  it(`${segment}: a legacy due_day=31 must not replace its release-based monthly anchor`,()=>{
    const args={segment,terms:3,monthlyAmortization:1000,releaseDate:"2026-01-28",addonMonths:0,
      firstPaymentDate:"2026-02-28",dueDay:31,totalLoan:3000};
    assert.deepEqual(generateAmortizationSchedule(args).map(x=>x.dueDate),["2026-02-28","2026-03-28","2026-04-28"]);
    assert.deepEqual(buildDiscountUnits({...args,paymentFrequency:"monthly",principal:2700,totalInterest:300,totalLoan:3000}).map(x=>x.dueDate),["2026-02-28","2026-03-28","2026-04-28"]);
  });
}
