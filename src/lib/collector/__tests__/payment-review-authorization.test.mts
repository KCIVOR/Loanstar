import assert from "node:assert/strict";
import test from "node:test";

import { canReviewAssignedPayment } from "../../notifications/workflow-recipients";

test("rejects an unassigned reviewer", () => {
  assert.equal(
    canReviewAssignedPayment(
      "collector-2",
      { collectorUserId: "collector-1", remedialUserId: null },
      false,
    ),
    false,
  );
});

test("allows the assigned collector when no remedial is set", () => {
  assert.equal(
    canReviewAssignedPayment(
      "collector-1",
      { collectorUserId: "collector-1", remedialUserId: null },
      false,
    ),
    true,
  );
});

test("collector loses review rights once remedial is set", () => {
  assert.equal(
    canReviewAssignedPayment(
      "collector-1",
      { collectorUserId: "collector-1", remedialUserId: "remedial-1" },
      false,
    ),
    false,
  );
});

test("remedial owner can review", () => {
  assert.equal(
    canReviewAssignedPayment(
      "remedial-1",
      { collectorUserId: "collector-1", remedialUserId: "remedial-1" },
      false,
    ),
    true,
  );
});

test("allows super-admin", () => {
  assert.equal(
    canReviewAssignedPayment(
      "admin-1",
      { collectorUserId: null, remedialUserId: null },
      true,
    ),
    true,
  );
});
