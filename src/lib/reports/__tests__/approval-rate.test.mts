import test from "node:test";
import assert from "node:assert/strict";
import {
  approvalRatePct,
  isCommitteeApproved,
  isCommitteeDenied,
} from "../approval-rate";

test("loan_active with approved in history counts as approved", () => {
  assert.equal(
    isCommitteeApproved({
      status: "loan_active",
      status_history: [
        { status: "for_approval", at: "2026-01-01T00:00:00Z" },
        { status: "approved", at: "2026-01-02T00:00:00Z" },
        { status: "loan_active", at: "2026-01-10T00:00:00Z" },
      ],
    }),
    true,
  );
});

test("current approved still counts", () => {
  assert.equal(isCommitteeApproved({ status: "approved", status_history: [] }), true);
});

test("denied current status counts as denied, not approved", () => {
  const app = {
    status: "denied",
    status_history: [
      { status: "for_approval", at: "2026-01-01T00:00:00Z" },
      { status: "denied", at: "2026-01-02T00:00:00Z" },
    ],
  };
  assert.equal(isCommitteeApproved(app), false);
  assert.equal(isCommitteeDenied(app), true);
});

test("draft with empty history is neither", () => {
  const app = { status: "draft", status_history: [] };
  assert.equal(isCommitteeApproved(app), false);
  assert.equal(isCommitteeDenied(app), false);
});

test("rate uses approved+denied only — live-shaped mix is not 40%", () => {
  const apps = [
    { status: "approved", status_history: [] },
    { status: "approved", status_history: [] },
    { status: "denied", status_history: [] },
    { status: "denied", status_history: [] },
    { status: "denied", status_history: [] },
    { status: "loan_active", status_history: [{ status: "approved", at: "2026-01-01T00:00:00Z" }] },
    { status: "loan_active", status_history: [{ status: "approved", at: "2026-01-01T00:00:00Z" }] },
    { status: "paid_off", status_history: [{ status: "approved", at: "2026-01-01T00:00:00Z" }] },
  ];
  // 2 current approved + 3 later-stage approved = 5; 3 denied; 5/8 = 62.5
  assert.equal(approvalRatePct(apps), 62.5);
});
