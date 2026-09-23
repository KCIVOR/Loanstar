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

describe("clear_hold final action (UAT committee hold clear)", () => {
  it("allows clear_hold from committee_hold with a reason and resolves to for_approval", () => {
    assert.doesNotThrow(() =>
      assertFinalActionPreconditions("committee_hold", "clear_hold" as FinalAction, {
        comment: "CI report received; ready for re-review",
      }),
    );
    assert.equal(resolveFinalActionStatus("clear_hold" as FinalAction), "for_approval");
  });

  it("requires a non-blank reason to clear a hold", () => {
    assert.throws(
      () =>
        assertFinalActionPreconditions("committee_hold", "clear_hold" as FinalAction, {}),
      /[Rr]eason.*required|required.*[Rr]eason/,
    );
    assert.throws(
      () =>
        assertFinalActionPreconditions("committee_hold", "clear_hold" as FinalAction, {
          comment: "   ",
        }),
      /[Rr]eason.*required|required.*[Rr]eason/,
    );
  });

  it("rejects clear_hold from for_approval (only committee_hold may be cleared)", () => {
    assert.throws(
      () =>
        assertFinalActionPreconditions("for_approval", "clear_hold" as FinalAction, {
          comment: "Reason",
        }),
      /not on committee hold/,
    );
  });

  it("rejects clear_hold from CSA on_hold and other non-committee statuses", () => {
    assert.throws(
      () =>
        assertFinalActionPreconditions("on_hold", "clear_hold" as FinalAction, {
          comment: "Reason",
        }),
      /Application is not pending committee decision/,
    );
    assert.throws(
      () =>
        assertFinalActionPreconditions("approved", "clear_hold" as FinalAction, {
          comment: "Reason",
        }),
      /Application is not pending committee decision/,
    );
  });

  it(
    "regression: does not strand an application if committee size grows while on hold " +
      "(clear_hold must not require assertAllVotesCast — see plan's Open Questions)",
    () => {
      // A hold can predate a committee-size increase (getCommitteeSize reads
      // live config, not a value frozen at hold time). If clear_hold enforced
      // the full-vote gate the way approve/deny/revisit do, an application
      // sitting on committee_hold with e.g. 2 of a now-3-member committee's
      // votes cast would throw here and could never be cleared — there is no
      // way to cast the missing vote from committee_hold (RLS only allows new
      // committee_votes rows while status = 'for_approval'). Precondition
      // checking alone must not perform any vote-count assertion for
      // clear_hold; the executeFinalAction-level skip is covered by the
      // source-contract test in clear-hold-route.test.mts.
      assert.doesNotThrow(() =>
        assertFinalActionPreconditions("committee_hold", "clear_hold" as FinalAction, {
          comment: "Clearing despite committee size change",
        }),
      );
    },
  );
});
