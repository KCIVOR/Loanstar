import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertFinalActionPreconditions,
  resolveFinalActionStatus,
  type FinalAction,
} from "../actions";

describe("committee hold final action (Phase 3)", () => {
  it("allows hold from for_approval and resolves to committee_hold", () => {
    assert.doesNotThrow(() =>
      assertFinalActionPreconditions("for_approval", "hold", {
        comment: "Need more docs from agent",
      }),
    );
    assert.equal(resolveFinalActionStatus("hold"), "committee_hold");
  });

  it("allows approve/deny/revisit from committee_hold", () => {
    for (const action of ["approve", "deny", "revisit"] as FinalAction[]) {
      assert.doesNotThrow(() =>
        assertFinalActionPreconditions("committee_hold", action, {
          comment: action === "approve" ? undefined : "Reason recorded",
          revisitRoute: action === "revisit" ? "csa" : undefined,
        }),
      );
    }
    assert.equal(resolveFinalActionStatus("approve"), "approved");
    assert.equal(resolveFinalActionStatus("deny"), "denied");
    assert.equal(resolveFinalActionStatus("revisit"), "for_revision");
  });

  it("requires a comment for hold", () => {
    assert.throws(
      () => assertFinalActionPreconditions("for_approval", "hold", {}),
      /Comment is required when placing a committee hold/,
    );
    assert.throws(
      () =>
        assertFinalActionPreconditions("for_approval", "hold", {
          comment: "   ",
        }),
      /Comment is required when placing a committee hold/,
    );
  });

  it("rejects re-hold as a no-op when already on committee_hold", () => {
    assert.throws(
      () =>
        assertFinalActionPreconditions("committee_hold", "hold", {
          comment: "Still waiting",
        }),
      /Application is already on committee hold/,
    );
  });

  it("rejects final actions outside for_approval / committee_hold", () => {
    assert.throws(
      () =>
        assertFinalActionPreconditions("on_hold", "hold", {
          comment: "wrong status",
        }),
      /Application is not pending committee decision/,
    );
    assert.throws(
      () =>
        assertFinalActionPreconditions("approved", "approve", {}),
      /Application is not pending committee decision/,
    );
  });

  it("does not treat CSA on_hold as a committee decision status", () => {
    assert.throws(
      () =>
        assertFinalActionPreconditions("on_hold", "approve", {}),
      /Application is not pending committee decision/,
    );
  });
});
