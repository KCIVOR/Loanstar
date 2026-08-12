import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertAllVotesCast,
  computeVoteTally,
  DEFAULT_COMMITTEE_SIZE,
  type VoteRecord,
} from "../votes";

function vote(n: number, value: "approve" | "deny" = "approve"): VoteRecord {
  return {
    id: `v-${n}`,
    voterId: `voter-${n}`,
    vote: value,
    votedAt: "2026-07-17T00:00:00Z",
    comment: null,
  };
}

describe("assertAllVotesCast (Phase 2 — final-action vote gate)", () => {
  it("exports DEFAULT_COMMITTEE_SIZE as 3", () => {
    assert.equal(DEFAULT_COMMITTEE_SIZE, 3);
  });

  it("throws when 0 votes are cast", () => {
    assert.throws(
      () => assertAllVotesCast([], 3),
      /All 3 committee votes must be cast before a final action/,
    );
  });

  it("throws when 1 vote is cast", () => {
    assert.throws(
      () => assertAllVotesCast([vote(1)], 3),
      /All 3 committee votes must be cast before a final action/,
    );
  });

  it("throws when 2 votes are cast", () => {
    assert.throws(
      () => assertAllVotesCast([vote(1), vote(2)], 3),
      /All 3 committee votes must be cast before a final action/,
    );
  });

  it("passes when all 3 votes are cast", () => {
    assert.doesNotThrow(() =>
      assertAllVotesCast([vote(1), vote(2), vote(3)], 3),
    );
  });

  it("passes when more than 3 votes somehow exist", () => {
    assert.doesNotThrow(() =>
      assertAllVotesCast([vote(1), vote(2), vote(3), vote(4)], 3),
    );
  });

  it("uses the passed committee size (5-member gate)", () => {
    assert.throws(
      () => assertAllVotesCast([vote(1), vote(2), vote(3), vote(4)], 5),
      /All 5 committee votes must be cast before a final action/,
    );
    assert.doesNotThrow(() =>
      assertAllVotesCast(
        [vote(1), vote(2), vote(3), vote(4), vote(5)],
        5,
      ),
    );
  });
});

describe("computeVoteTally majority generalization", () => {
  it("does not treat 2 of 5 as a majority", () => {
    const tally = computeVoteTally([vote(1), vote(2)], 5);
    assert.equal(tally.hasMajority, false);
    assert.equal(tally.label, null);
    assert.equal(tally.approve, 2);
  });

  it("treats 3 of 5 as a majority approve", () => {
    const tally = computeVoteTally([vote(1), vote(2), vote(3)], 5);
    assert.equal(tally.hasMajority, true);
    assert.equal(tally.label, "3/5 — Approve");
  });
});
