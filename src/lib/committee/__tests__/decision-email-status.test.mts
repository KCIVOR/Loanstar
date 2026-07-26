import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  decisionEmailTriggerForAction,
  deriveDecisionEmailStatus,
  type DecisionEmailAuditRow,
} from "../decision-email-status";

describe("decisionEmailTriggerForAction", () => {
  it("maps approve/deny to audit triggers", () => {
    assert.equal(
      decisionEmailTriggerForAction("approve"),
      "committee_approve_email",
    );
    assert.equal(
      decisionEmailTriggerForAction("deny"),
      "committee_deny_email",
    );
    assert.equal(decisionEmailTriggerForAction("hold"), null);
    assert.equal(decisionEmailTriggerForAction("revisit"), null);
  });
});

describe("deriveDecisionEmailStatus", () => {
  const rows: DecisionEmailAuditRow[] = [
    {
      created_at: "2026-07-24T11:00:00.000Z",
      after_data: {
        trigger: "committee_deny_email",
        emailSent: true,
      },
    },
    {
      created_at: "2026-07-24T10:00:00.000Z",
      after_data: {
        trigger: "committee_deny_email",
        emailSent: false,
        reason: "borrower_email_missing",
      },
    },
  ];

  it("marks sent when any successful attempt exists; uses latest for last*", () => {
    const status = deriveDecisionEmailStatus(rows, "borrower@example.com");
    assert.equal(status.sent, true);
    assert.equal(status.lastAttemptAt, "2026-07-24T11:00:00.000Z");
    assert.equal(status.lastEmailSent, true);
    assert.equal(status.lastFailureReason, null);
    assert.equal(status.borrowerEmail, "borrower@example.com");
  });

  it("returns failure reason from latest failed attempt when never sent", () => {
    const failedOnly: DecisionEmailAuditRow[] = [
      {
        created_at: "2026-07-24T09:00:00.000Z",
        after_data: {
          trigger: "committee_approve_email",
          emailSent: false,
          reason: "channel_pref_blocked",
        },
      },
    ];
    const status = deriveDecisionEmailStatus(failedOnly, null);
    assert.equal(status.sent, false);
    assert.equal(status.lastEmailSent, false);
    assert.equal(status.lastFailureReason, "channel_pref_blocked");
    assert.equal(status.borrowerEmail, null);
  });

  it("handles empty history", () => {
    const status = deriveDecisionEmailStatus([], "a@b.com");
    assert.equal(status.sent, false);
    assert.equal(status.lastAttemptAt, null);
    assert.equal(status.lastEmailSent, null);
    assert.equal(status.lastFailureReason, null);
  });
});
