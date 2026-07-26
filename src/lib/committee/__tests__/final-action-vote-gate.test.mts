import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertAllVotesCast,
  COMMITTEE_SIZE,
  type VoteRecord,
} from "../votes";

function vote(n: number): VoteRecord {
  return {
    id: `v-${n}`,
    voterId: `voter-${n}`,
    vote: "approve",
    votedAt: "2026-07-17T00:00:00Z",
    comment: null,
  };
}

describe("assertAllVotesCast (Phase 2 — final-action vote gate)", () => {
  it("exports COMMITTEE_SIZE as 3", () => {
    assert.equal(COMMITTEE_SIZE, 3);
  });

  it("throws when 0 votes are cast", () => {
    assert.throws(
      () => assertAllVotesCast([]),
      /All 3 committee votes must be cast before a final action/,
    );
  });

  it("throws when 1 vote is cast", () => {
    assert.throws(
      () => assertAllVotesCast([vote(1)]),
      /All 3 committee votes must be cast before a final action/,
    );
  });

  it("throws when 2 votes are cast", () => {
    assert.throws(
      () => assertAllVotesCast([vote(1), vote(2)]),
      /All 3 committee votes must be cast before a final action/,
    );
  });

  it("passes when all 3 votes are cast", () => {
    assert.doesNotThrow(() =>
      assertAllVotesCast([vote(1), vote(2), vote(3)]),
    );
  });

  it("passes when more than 3 votes somehow exist", () => {
    assert.doesNotThrow(() =>
      assertAllVotesCast([vote(1), vote(2), vote(3), vote(4)]),
    );
  });
});
