import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BORROWER_PIPELINE_STAGES,
  borrowerPipelineIndex,
  borrowerPipelineSteps,
} from "../pipeline";

describe("borrowerPipelineIndex", () => {
  it("maps documents_pending to Documents", () => {
    assert.equal(borrowerPipelineIndex("documents_pending"), 0);
  });

  it("maps for_verification to Review", () => {
    assert.equal(borrowerPipelineIndex("for_verification"), 1);
  });

  it("maps awaiting_confirmation to Terms", () => {
    assert.equal(borrowerPipelineIndex("awaiting_confirmation"), 3);
  });

  it("maps loan_active to Active loan", () => {
    assert.equal(borrowerPipelineIndex("loan_active"), 5);
  });

  it("maps paid_off to Paid off", () => {
    assert.equal(
      borrowerPipelineIndex("paid_off"),
      BORROWER_PIPELINE_STAGES.length - 1,
    );
  });

  it("returns -1 for unknown", () => {
    assert.equal(borrowerPipelineIndex("nope"), -1);
  });
});

describe("borrowerPipelineSteps", () => {
  it("builds seven borrower-facing steps", () => {
    assert.equal(borrowerPipelineSteps("documents_pending").length, 7);
  });

  it("marks earlier stages done and current stage current", () => {
    const steps = borrowerPipelineSteps("for_approval");
    assert.equal(steps[0].state, "done");
    assert.equal(steps[1].state, "done");
    assert.equal(steps[2].state, "current");
    assert.equal(steps[3].state, "todo");
  });

  it("surfaces denied on Approval without treating it as a later step", () => {
    const steps = borrowerPipelineSteps("denied");
    assert.equal(steps[2].state, "current");
    assert.match(String(steps[2].description ?? ""), /denied/i);
    assert.equal(steps[3].state, "todo");
  });
});
