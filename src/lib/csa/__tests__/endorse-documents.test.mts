import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canShowConfirmAction,
  canShowSignAction,
  uploadedAwaitingSubtitle,
} from "../../documents/checklist-actions";
import {
  getCompletionSummary,
  type ChecklistItem,
} from "../../documents/checklist";

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
    revisionRemarks: null,
  };
}

describe("endorse readiness (Phase 1 — confirmed gate)", () => {
  it("does not treat uploaded-only intake as checklist-complete", () => {
    const summary = getCompletionSummary([
      item("uploaded"),
      item("uploaded"),
    ]);
    assert.equal(summary.complete, 0);
    assert.notEqual(summary.complete, summary.required);
  });

  it("requires every required doc confirmed before endorse checklist is complete", () => {
    const mixed = getCompletionSummary([
      item("confirmed"),
      item("uploaded"),
    ]);
    assert.equal(mixed.complete, 1);
    assert.equal(mixed.required, 2);
    assert.notEqual(mixed.complete, mixed.required);

    const allConfirmed = getCompletionSummary([
      item("confirmed"),
      item("confirmed"),
    ]);
    assert.equal(allConfirmed.complete, allConfirmed.required);
  });
});

describe("DocumentChecklist Confirm visibility (Phase 1.7)", () => {
  it("shows Confirm only for uploaded rows when confirmApiPath is set", () => {
    assert.equal(
      canShowConfirmAction({
        hasConfirmApi: true,
        documentId: "doc-1",
        status: "uploaded",
      }),
      true,
    );
  });

  it("hides Confirm when confirmApiPath is missing", () => {
    assert.equal(
      canShowConfirmAction({
        hasConfirmApi: false,
        documentId: "doc-1",
        status: "uploaded",
      }),
      false,
    );
  });

  it("hides Confirm for pending and confirmed rows", () => {
    assert.equal(
      canShowConfirmAction({
        hasConfirmApi: true,
        documentId: "doc-1",
        status: "pending",
      }),
      false,
    );
    assert.equal(
      canShowConfirmAction({
        hasConfirmApi: true,
        documentId: "doc-1",
        status: "confirmed",
      }),
      false,
    );
  });

  it("hides Confirm without a documentId, when readOnly, or flagsOnly", () => {
    assert.equal(
      canShowConfirmAction({
        hasConfirmApi: true,
        documentId: null,
        status: "uploaded",
      }),
      false,
    );
    assert.equal(
      canShowConfirmAction({
        hasConfirmApi: true,
        documentId: "doc-1",
        status: "uploaded",
        readOnly: true,
      }),
      false,
    );
    assert.equal(
      canShowConfirmAction({
        hasConfirmApi: true,
        documentId: "doc-1",
        status: "uploaded",
        flagsOnly: true,
      }),
      false,
    );
  });

  it("defaults Sign off — only allowSign=true can show Sign on uploaded", () => {
    assert.equal(
      canShowSignAction({
        allowSign: false,
        documentId: "doc-1",
        status: "uploaded",
      }),
      false,
    );
    assert.equal(
      canShowSignAction({
        allowSign: true,
        documentId: "doc-1",
        status: "uploaded",
      }),
      true,
    );
  });

  it("uses CSA-awaiting copy for uploaded rows", () => {
    assert.equal(
      uploadedAwaitingSubtitle("passport.pdf"),
      "passport.pdf · Awaiting CSA confirmation",
    );
    assert.equal(
      uploadedAwaitingSubtitle(null),
      "Uploaded · Awaiting CSA confirmation",
    );
  });
});
