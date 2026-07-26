import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CigSequenceState } from "../sequence";
import {
  buildCigWorkspaceSteps,
  cigChecksSummary,
  cigFormComplete,
  cigForwardReady,
  cigHasFinding,
  cigNextStep,
  cigWaitingLabel,
  cigWorkspaceStageIndex,
} from "../workspace";

function sequenceAt(current: CigSequenceState["current"]): CigSequenceState {
  const order = [
    "borrower_review",
    "external_checks",
    "ci_references",
    "crewing_manager",
    "finding",
    "forward",
  ] as const;
  const currentIdx = order.indexOf(current);
  const completed = {
    borrower_review: false,
    external_checks: false,
    ci_references: false,
    crewing_manager: false,
    finding: false,
    forward: false,
  } as CigSequenceState["completed"];
  const unlocked = {
    borrower_review: true,
    external_checks: false,
    ci_references: false,
    crewing_manager: false,
    finding: false,
    forward: false,
  } as CigSequenceState["unlocked"];

  for (let i = 0; i < order.length; i++) {
    const stage = order[i];
    completed[stage] = current === "forward" || i < currentIdx;
    unlocked[stage] = current === "forward" || i <= currentIdx;
  }
  unlocked.borrower_review = true;
  return { current, completed, unlocked };
}

describe("cigChecksSummary", () => {
  it("counts recorded checks", () => {
    const summary = cigChecksSummary([
      { result: "pass" },
      { result: "pending" },
      { result: "fail" },
    ]);
    assert.equal(summary.total, 3);
    assert.equal(summary.recorded, 2);
    assert.equal(summary.complete, false);
  });
});

describe("cigFormComplete", () => {
  it("ignores check-only and finding missing items", () => {
    assert.equal(cigFormComplete(["NCL check not recorded"]), true);
    assert.equal(
      cigFormComplete(["Finding (positive/negative) required"]),
      true,
    );
    assert.equal(
      cigFormComplete(["PIC allotment awareness notes required"]),
      false,
    );
  });
});

describe("cigWorkspaceStageIndex", () => {
  it("advances through hard-sequence stages", () => {
    assert.equal(
      cigWorkspaceStageIndex({
        status: "for_verification",
        sequenceCurrent: "borrower_review",
        forwarded: false,
      }),
      0,
    );
    assert.equal(
      cigWorkspaceStageIndex({
        status: "for_verification",
        sequenceCurrent: "external_checks",
        forwarded: false,
      }),
      1,
    );
    assert.equal(
      cigWorkspaceStageIndex({
        status: "for_verification",
        sequenceCurrent: "finding",
        forwarded: false,
      }),
      4,
    );
    assert.equal(
      cigWorkspaceStageIndex({
        status: "for_verification",
        sequenceCurrent: "forward",
        forwarded: false,
      }),
      5,
    );
  });

  it("locks at forward when already with committee", () => {
    assert.equal(
      cigWorkspaceStageIndex({
        status: "for_approval",
        sequenceCurrent: "forward",
        forwarded: true,
      }),
      5,
    );
  });
});

describe("buildCigWorkspaceSteps", () => {
  it("marks current stage", () => {
    const steps = buildCigWorkspaceSteps({
      status: "for_verification",
      sequenceCurrent: "external_checks",
      forwarded: false,
    });
    assert.equal(steps[0].state, "done");
    assert.equal(steps[1].state, "current");
    assert.equal(steps[2].state, "todo");
    assert.equal(steps.length, 6);
  });
});

describe("cigForwardReady / cigHasFinding", () => {
  it("requires checks, form, and finding", () => {
    assert.equal(cigHasFinding("positive"), true);
    assert.equal(
      cigForwardReady({
        checksComplete: true,
        formComplete: true,
        hasFinding: true,
        forwarded: false,
      }),
      true,
    );
  });
});

describe("cigNextStep", () => {
  it("prioritizes revision and overdue callback", () => {
    assert.match(
      cigNextStep({
        status: "for_revision",
        missing: [],
        sequence: sequenceAt("forward"),
        forwarded: false,
        activeCallbackAt: null,
      }).title,
      /revisit/i,
    );
    assert.match(
      cigNextStep({
        status: "for_verification",
        missing: [],
        sequence: sequenceAt("borrower_review"),
        forwarded: false,
        activeCallbackAt: "2026-07-01T00:00:00.000Z",
        callbackOverdue: true,
      }).title,
      /overdue/i,
    );
  });

  it("guides borrower review before checks", () => {
    assert.match(
      cigNextStep({
        status: "for_verification",
        missing: ["Field completeness review required"],
        sequence: sequenceAt("borrower_review"),
        forwarded: false,
        activeCallbackAt: null,
      }).title,
      /borrower review/i,
    );
  });

  it("does not claim finding unlock while crewing incomplete", () => {
    const step = cigNextStep({
      status: "for_verification",
      missing: ["Crewing manager position required"],
      sequence: sequenceAt("crewing_manager"),
      forwarded: false,
      activeCallbackAt: null,
    });
    assert.match(step.title, /crewing/i);
    assert.doesNotMatch(step.body, /unlock finding/i);
  });
});

describe("cigWaitingLabel", () => {
  it("formats waiting days", () => {
    assert.equal(
      cigWaitingLabel(
        "2026-07-01T00:00:00.000Z",
        new Date("2026-07-10T12:00:00.000Z"),
      ),
      "9d",
    );
  });
});
