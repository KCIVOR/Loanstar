import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getCompletionSummary,
  rowMatchesChecklistScope,
  type ChecklistItem,
} from "../checklist";

/** Seafarer intake slugs after Phase 2.1 backfill — regression snapshot. */
const SEAFARER_INTAKE_SLUGS = [
  "clearance_form",
  "declaration_form",
  "house_sketch",
  "agency_consent_letter",
  "data_privacy_consent",
  "bap_customer_consent",
  "valid_ids",
  "passport",
  "seaman_book",
  "photo_2x2",
  "contract",
] as const;

const SME_COMMON_INTAKE_SLUGS = [
  "business_registration",
  "owner_authorized_rep_id",
  "valid_ids",
  "mayors_permit",
  "tin_ctc",
  "location_sketch",
  "bank_authorization",
  "lslgc_consent_form_2025",
  "bap_customer_consent",
  "client_supplier_list",
  "proof_of_transaction",
] as const;

const SME_CORPORATE_ONLY_SLUGS = [
  "board_resolution",
  "secretary_certificate",
] as const;

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

describe("rowMatchesChecklistScope (SME Phase 2)", () => {
  it("keeps seafarer rows only for seafarer segment", () => {
    assert.equal(
      rowMatchesChecklistScope(
        { segment: "seafarer", entity_type: null },
        "seafarer",
        null,
      ),
      true,
    );
    assert.equal(
      rowMatchesChecklistScope(
        { segment: "sme", entity_type: null },
        "seafarer",
        null,
      ),
      false,
    );
  });

  it("includes SME common rows for individual and corporate", () => {
    const common = { segment: "sme", entity_type: null };
    assert.equal(rowMatchesChecklistScope(common, "sme", "individual"), true);
    assert.equal(rowMatchesChecklistScope(common, "sme", "corporate"), true);
  });

  it("includes corporate-only rows only for corporate entity type", () => {
    const corporateOnly = { segment: "sme", entity_type: "corporate" };
    assert.equal(
      rowMatchesChecklistScope(corporateOnly, "sme", "corporate"),
      true,
    );
    assert.equal(
      rowMatchesChecklistScope(corporateOnly, "sme", "individual"),
      false,
    );
  });

  it("documents expected intake slug sets (fixtures for browser parity)", () => {
    assert.equal(SEAFARER_INTAKE_SLUGS.length, 11);
    assert.equal(SME_COMMON_INTAKE_SLUGS.length, 11);
    assert.deepEqual([...SME_CORPORATE_ONLY_SLUGS], [
      "board_resolution",
      "secretary_certificate",
    ]);
    const individual: string[] = [...SME_COMMON_INTAKE_SLUGS];
    const corporate: string[] = [
      ...SME_COMMON_INTAKE_SLUGS,
      ...SME_CORPORATE_ONLY_SLUGS,
    ];
    assert.equal(individual.length, 11);
    assert.equal(corporate.length, 13);
    assert.ok(!individual.includes("seaman_book"));
    assert.ok(!individual.includes("board_resolution"));
  });
});

