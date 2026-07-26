import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COMMITTEE_DECISION_SLUGS,
  assertDecisionTemplateContent,
  listForbiddenMergeVars,
} from "../decision-templates";

describe("decision-templates", () => {
  it("allowlists denied and approved only", () => {
    assert.deepEqual([...COMMITTEE_DECISION_SLUGS].sort(), [
      "application_approved",
      "application_denied",
    ]);
  });

  it("accepts polite denial copy with borrower_name only", () => {
    assert.doesNotThrow(() =>
      assertDecisionTemplateContent({
        slug: "application_denied",
        subject: "LoanStar — Application Update",
        bodyHtml:
          "<p>Dear {{borrower_name}},</p><p>We are unable to proceed at this time.</p>",
      }),
    );
  });

  it("rejects denial content that references reason-like merge vars", () => {
    assert.throws(
      () =>
        assertDecisionTemplateContent({
          slug: "application_denied",
          subject: "Denied",
          bodyHtml: "<p>{{borrower_name}} reason: {{reason}}</p>",
        }),
      /reason|forbidden/i,
    );
  });

  it("lists forbidden vars found in text", () => {
    const found = listForbiddenMergeVars(
      "Hello {{borrower_name}} {{comment}} {{finding}}",
    );
    assert.ok(found.includes("comment"));
    assert.ok(found.includes("finding"));
  });
});
