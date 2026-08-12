import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCsaWorkspaceSteps,
  csaNextStep,
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
