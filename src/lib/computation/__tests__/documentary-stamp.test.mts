import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeDocumentaryStamp, documentaryStampTermDays } from "../documentary-stamp";

describe("client documentary stamp rule", () => {
  for (const [days, expected] of [[0,0],[90,184.93],[364,747.95],[365,750],[366,750],[730,750]] as const) {
    it(`${days} days on 100000 gives ${expected}`, () => assert.equal(computeDocumentaryStamp(100000,days),expected));
  }
  it("rounds once at the final centavo", () => assert.equal(computeDocumentaryStamp(1.01,183),0));
  it("counts leap day and excludes the release day", () => {
    assert.equal(documentaryStampTermDays(new Date(2024,1,28),new Date(2024,2,1)),2);
    assert.equal(documentaryStampTermDays(new Date(2025,1,28),new Date(2025,2,1)),1);
  });
  it("uses calendar days independent of daylight-saving hours", () => {
    assert.equal(documentaryStampTermDays(new Date(2026,2,7),new Date(2026,2,9)),2);
    assert.equal(documentaryStampTermDays(new Date(2026,9,31),new Date(2026,10,2)),2);
  });
  it("does not return negative tax for invalid date ranges", () => {
    assert.throws(()=>documentaryStampTermDays(new Date(2026,0,20),new Date(2026,0,15)),/maturity date/);
    assert.throws(()=>computeDocumentaryStamp(100000,-1),/non-negative/);
  });
});
