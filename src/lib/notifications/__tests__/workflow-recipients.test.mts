import assert from "node:assert/strict";
import test from "node:test";

import { chooseProofReviewRecipient } from "../workflow-recipients";

test("prefers remedial over collector (account handed over)", () => {
  assert.equal(
    chooseProofReviewRecipient({
      collectorUserId: "collector-1",
      remedialUserId: "remedial-1",
    }),
    "remedial-1",
  );
});

test("uses collector when no remedial is set", () => {
  assert.equal(
    chooseProofReviewRecipient({
      collectorUserId: "collector-1",
      remedialUserId: null,
    }),
    "collector-1",
  );
});

test("uses remedial when collector is absent", () => {
  assert.equal(
    chooseProofReviewRecipient({
      collectorUserId: null,
      remedialUserId: "remedial-1",
    }),
    "remedial-1",
  );
});

test("does not broadcast without an assignment", () => {
  assert.equal(
    chooseProofReviewRecipient({ collectorUserId: null, remedialUserId: null }),
    null,
  );
});
