import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCsaWorkspaceSteps,
  csaNextStep,
  csaReasonLabel,
  csaWorkspaceStageIndex,
} from "../workspace";

describe("csaWorkspaceStageIndex", () => {
  it("starts on documents when intake incomplete", () => {
    assert.equal(
      csaWorkspaceStageIndex({
        status: "documents_pending",
        docsComplete: false,
        nclDone: false,
        hasComputation: false,
        endorseReady: false,
      }),
      0,
    );
  });

  it("moves to NCL when docs complete", () => {
    assert.equal(
      csaWorkspaceStageIndex({
        status: "documents_pending",
        docsComplete: true,
        nclDone: false,
        hasComputation: false,
        endorseReady: false,
      }),
      1,
    );
  });

  it("moves to computation when NCL done", () => {
    assert.equal(
      csaWorkspaceStageIndex({
        status: "documents_pending",
        docsComplete: true,
        nclDone: true,
        hasComputation: false,
        endorseReady: false,
      }),
      2,
    );
  });

  it("lands on endorse when ready", () => {
    assert.equal(
      csaWorkspaceStageIndex({
        status: "documents_pending",
        docsComplete: true,
        nclDone: true,
        hasComputation: true,
        endorseReady: true,
      }),
      3,
    );
  });
});

describe("buildCsaWorkspaceSteps", () => {
  it("builds four CSA stages", () => {
    assert.equal(
      buildCsaWorkspaceSteps({
        status: "documents_pending",
        docsComplete: false,
        nclDone: false,
        hasComputation: false,
        endorseReady: false,
      }).length,
      4,
    );
  });
});

describe("csaNextStep", () => {
  it("asks for missing documents first", () => {
    const step = csaNextStep({
      status: "documents_pending",
      docsRequired: 8,
      docsUploaded: 2,
      nclResult: "pending",
      hasComputation: false,
      endorseReady: false,
    });
    assert.match(step.title, /document/i);
    assert.match(step.body, /6/);
  });

  it("asks for NCL when docs are in", () => {
    const step = csaNextStep({
      status: "documents_pending",
      docsRequired: 8,
      docsUploaded: 8,
      nclResult: "pending",
      hasComputation: false,
      endorseReady: false,
    });
    assert.match(step.title, /NCL/i);
  });

  it("asks for duplication screening on SME when docs are in", () => {
    const step = csaNextStep({
      status: "documents_pending",
      docsRequired: 8,
      docsUploaded: 8,
      nclResult: "pending",
      hasComputation: false,
      endorseReady: false,
      segment: "sme",
    });
    assert.match(step.title, /duplication/i);
  });
});

describe("csaNextStep reasons", () => {
  const base = {
    docsRequired: 8,
    docsUploaded: 8,
    nclResult: "clear",
    hasComputation: true,
    endorseReady: true,
  };

  it("shows the committee reason for a csa-routed revisit", () => {
    const step = csaNextStep({
      ...base,
      status: "for_revision",
      revisit: { routeTo: "csa", comment: "fix docs", createdAt: "t" },
    });
    assert.equal(step.title, "Committee sent this back");
    assert.equal(step.body, "fix docs. Update the file, then click Revision complete.");
  });

  it("keeps the old fallback for a revision with no readable notice", () => {
    const step = csaNextStep({ ...base, status: "for_revision", revisit: null });
    assert.equal(step.title, "Revision required");
    assert.equal(
      step.body,
      "Borrower documents need updates before you can endorse.",
    );
  });

  it("explains a CIG return and keeps the note verbatim", () => {
    const step = csaNextStep({
      ...base,
      status: "submitted",
      blocker: "Returned by CIG: re-upload valid_id",
    });
    assert.equal(step.title, "Returned by CIG");
    assert.equal(
      step.body,
      "re-upload valid_id. Fix the file, then endorse it to CIG again.",
    );
  });

  it("leaves on_hold unchanged", () => {
    const step = csaNextStep({ ...base, status: "on_hold", blocker: "Pending docs" });
    assert.equal(step.title, "File on hold");
  });
});

describe("csaReasonLabel", () => {
  it("labels a CIG return", () => {
    assert.deepEqual(
      csaReasonLabel({ blocker: "Returned by CIG: x_y", revisit: null }),
      { label: "Returned by CIG", text: "x_y" },
    );
  });

  it("labels a committee revisit", () => {
    assert.deepEqual(
      csaReasonLabel({
        blocker: null,
        revisit: { routeTo: "csa", comment: "fix docs", createdAt: "t" },
      }),
      { label: "Committee revisit", text: "fix docs" },
    );
  });

  it("keeps the hold label for other blockers", () => {
    assert.deepEqual(csaReasonLabel({ blocker: "Pending docs", revisit: null }), {
      label: "Hold reason",
      text: "Pending docs",
    });
  });

  it("returns null when empty", () => {
    assert.equal(csaReasonLabel({ blocker: null, revisit: null }), null);
  });
});
