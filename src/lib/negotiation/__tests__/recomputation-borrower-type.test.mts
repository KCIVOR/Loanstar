import assert from "node:assert/strict";
import { it } from "node:test";
import { persistComputation, mapComputationRow } from "@/lib/csa/computation";
import { committeeAdjustPreDecision, lraRecomputeComputation } from "../service";
import { database } from "./fixtures/recomputation-database";

const input={loanTypeId:"new-type",inputMode:"PRINCIPAL" as const,amount:100000,terms:4,addonMonths:0,dueDay:15,releaseDate:"2026-01-15"};
for (const role of ["CSA","Committee","LRA"]) for (const inputMode of ["PRINCIPAL","NET_SARADO","NET_LESS_SECURITY"] as const) {
  it(`${role} ${inputMode}: both classifications persist with identical financials`,async()=>{
    const results=[];
    for(const seafarerBorrowerType of ["SEAFARER","ALLOTTEE"] as const){
      const db=database("seafarer",0.0199,0.0199);
      const saved=role==="CSA"?await persistComputation(db.client,{...input,inputMode,seafarerBorrowerType,loanApplicationId:"app",segment:"seafarer",pfRate:0.08,interestRate:0.0199,securityFeeRate:0.0199,computedBy:"actor"})
        :await(role==="Committee"?committeeAdjustPreDecision:lraRecomputeComputation)(db.client,"app","actor",{...input,inputMode,seafarerBorrowerType});
      assert.equal(db.row().seafarer_borrower_type,seafarerBorrowerType);
      assert.equal(saved.computation.seafarerBorrowerType,seafarerBorrowerType);
      const {seafarerBorrowerType: classification,...rest}=saved.computation;
      assert.ok(classification);results.push(rest);
    }
    assert.deepEqual(results[0],results[1]);
  });
}
it("legacy rows stay unrecorded rather than inferred",()=>{
  assert.equal(mapComputationRow({}).seafarerBorrowerType,null);
});
for (const run of [committeeAdjustPreDecision,lraRecomputeComputation]) {
  it(`${run.name}: omission preserves the prior Allottee choice`,async()=>{
    const db=database("seafarer",0.0199,0.0199,true,"ALLOTTEE");
    const saved=await run(db.client,"app","actor",input);
    assert.equal(saved.computation.seafarerBorrowerType,"ALLOTTEE");
  });
  it(`${run.name}: explicit legacy null is preserved as unrecorded`,async()=>{
    const db=database("seafarer",0.0199,0.0199,true,"ALLOTTEE");
    const saved=await run(db.client,"app","actor",{...input,seafarerBorrowerType:null});
    assert.equal(saved.computation.seafarerBorrowerType,null);
  });
  it(`${run.name}: rejects invalid classifications before inserting`,async()=>{
    const db=database("seafarer",0.0199,0.0199);
    await assert.rejects(run(db.client,"app","actor",{...input,seafarerBorrowerType:"OTHER" as never}),/Borrower type/);
    assert.equal(db.row(),null);
  });
}
for(const segment of ["sme","individual"] as const) it(`${segment}: rejects assigning a Seafarer classification`,async()=>{
  const db=database(segment,0.0199,0.0199);
  await assert.rejects(persistComputation(db.client,{...input,seafarerBorrowerType:"ALLOTTEE",loanApplicationId:"app",segment,pfRate:0.08,interestRate:0.0199,securityFeeRate:0,computedBy:"actor"}),/Borrower type/);
  assert.equal(db.row(),null);
});
