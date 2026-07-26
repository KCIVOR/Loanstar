import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getCompletionSummary, type ChecklistItem } from "../checklist";

function item(
  status: ChecklistItem["status"],
  isRequired = true,
): ChecklistItem {
  return {
    documentTypeId: "t",
    documentTypeSlug: "passport",
    documentTypeName: "Passport",
    stage: "intake",
    isRequired,
    isOptionalFlag: !isRequired,
    sortOrder: 1,
    documentId: status ? "d" : null,
    status,
    fileName: status ? "file.pdf" : null,
    mimeType: null,
    fileSize: null,
    uploadedBy: null,
    confirmedBy: status === "confirmed" ? "csa-user" : null,
    confirmedAt: status === "confirmed" ? "2026-07-17T00:00:00Z" : null,
    revisionRemarks: status === "needs_revision" ? "Blurry scan" : null,
  };
}

describe("getCompletionSummary (endorse gate semantics)", () => {
  it("counts only confirmed docs as complete — uploaded is not enough", () => {
    const summary = getCompletionSummary([
      item("confirmed"),
      item("uploaded"),
      item("pending"),
    ]);
    assert.equal(summary.required, 3);
    assert.equal(summary.complete, 1);
    assert.equal(summary.uploaded, 2);
    assert.equal(summary.incomplete, 1);
  });

  it("treats needs_revision as incomplete and not uploaded", () => {
    const summary = getCompletionSummary([
      item("confirmed"),
      item("needs_revision"),
    ]);
    assert.equal(summary.complete, 1);
    assert.equal(summary.uploaded, 1);
    assert.equal(summary.incomplete, 1);
    assert.notEqual(summary.complete, summary.required);
  });

  it("all-uploaded checklist is still not endorse-ready (needs CSA confirm)", () => {
    const summary = getCompletionSummary([item("uploaded"), item("uploaded")]);
    assert.equal(summary.complete, 0);
    assert.notEqual(summary.complete, summary.required);
  });

  it("all-confirmed required checklist reaches 100%", () => {
    const summary = getCompletionSummary([
      item("confirmed"),
      item("confirmed"),
      item(null, false),
    ]);
    assert.equal(summary.complete, summary.required);
    assert.equal(summary.percentComplete, 100);
  });

  it("optional items never block completion", () => {
    const summary = getCompletionSummary([item("confirmed"), item("pending", false)]);
    assert.equal(summary.complete, summary.required);
  });
});
