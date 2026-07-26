import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checklistProgress,
  leadPipelineStage,
  leadStatusVariant,
  pipelineStageLabel,
  pipelineStageVariant,
} from "../pipeline";

describe("checklistProgress", () => {
  it("returns null percent when no required items", () => {
    assert.deepEqual(checklistProgress([]), {
      required: 0,
      complete: 0,
      percent: null,
    });
  });

  it("counts required items that are uploaded or complete", () => {
    assert.deepEqual(
      checklistProgress([
        { isRequired: true, completionStatus: "complete" },
        { isRequired: true, completionStatus: "uploaded" },
        { isRequired: true, completionStatus: "pending" },
        { isRequired: false, completionStatus: "pending" },
      ]),
      { required: 3, complete: 2, percent: 67 },
    );
  });
});

describe("leadPipelineStage", () => {
  it("classifies unlinked, gathering, and ready", () => {
    assert.equal(
      leadPipelineStage({ applicationId: null, checklistPercent: null }),
      "awaiting_link",
    );
    assert.equal(
      leadPipelineStage({ applicationId: "a", checklistPercent: 40 }),
      "gathering_docs",
    );
    assert.equal(
      leadPipelineStage({ applicationId: "a", checklistPercent: 100 }),
      "docs_ready",
    );
  });
});

describe("labels and variants", () => {
  it("maps stages and lead status", () => {
    assert.equal(pipelineStageLabel("awaiting_link"), "Awaiting link");
    assert.equal(pipelineStageVariant("docs_ready"), "success");
    assert.equal(leadStatusVariant("open"), "teal");
    assert.equal(leadStatusVariant("closed"), "neutral");
  });
});
