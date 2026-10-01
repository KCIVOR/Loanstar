import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { childLookupTable, directApplicationId, mergeApplicationLink } from "../link";

describe("mergeApplicationLink", () => {
  it("adds the loan id when absent", () => {
    assert.deepEqual(mergeApplicationLink({ a: 1 }, "L1"), { a: 1, applicationId: "L1" });
    assert.deepEqual(mergeApplicationLink(null, "L1"), { applicationId: "L1" });
  });
  it("never overwrites an existing id", () => {
    assert.deepEqual(mergeApplicationLink({ applicationId: "X" }, "L1"), { applicationId: "X" });
  });
  it("is a no-op without an id", () => {
    assert.equal(mergeApplicationLink(null, null), null);
  });
});

describe("directApplicationId", () => {
  const row = { entity_type: null, entity_id: null, after_data: null, before_data: null };
  it("uses entity_id for loan applications", () => {
    assert.equal(directApplicationId({ ...row, entity_type: "loan_application", entity_id: "A" }), "A");
  });
  it("reads after/before snapshots", () => {
    assert.equal(directApplicationId({ ...row, entity_type: "document", after_data: { applicationId: "B" } }), "B");
    assert.equal(directApplicationId({ ...row, after_data: { loanApplicationId: "C" } }), "C");
    assert.equal(directApplicationId({ ...row, before_data: { applicationId: "D" } }), "D");
  });
  it("treats votes and verification rows as loan ids", () => {
    assert.equal(directApplicationId({ ...row, entity_type: "committee_vote", entity_id: "V" }), "V");
    assert.equal(directApplicationId({ ...row, entity_type: "verification", entity_id: "W" }), "W");
  });
  it("returns null when unknown", () => {
    assert.equal(directApplicationId({ ...row, entity_type: "user", entity_id: "U" }), null);
  });
});

describe("childLookupTable", () => {
  it("maps child entities to their tables", () => {
    assert.equal(childLookupTable("release_file"), "release_files");
    assert.equal(childLookupTable("masterlist"), "masterlist");
    assert.equal(childLookupTable("computation"), "computations");
    assert.equal(childLookupTable("verification"), "verifications");
    assert.equal(childLookupTable("document"), "documents");
    assert.equal(childLookupTable("payment"), "payments");
    assert.equal(childLookupTable("committee_assessment"), "committee_assessments");
    assert.equal(childLookupTable("user"), null);
  });
});
