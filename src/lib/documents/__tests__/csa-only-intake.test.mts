import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CSA_ONLY_INTAKE_SLUGS,
  excludeCsaOnlyIntakeItems,
  isCsaOnlyIntakeSlug,
} from "../csa-only-intake";

describe("csa-only intake slugs", () => {
  it("marks all 5 CSA-only slugs correctly", () => {
    const expected = [
      "clearance_form",
      "declaration_form",
      "agency_consent_letter",
      "data_privacy_consent",
      "bap_customer_consent",
    ];
    for (const slug of expected) {
      assert.ok(
        CSA_ONLY_INTAKE_SLUGS.includes(
          slug as (typeof CSA_ONLY_INTAKE_SLUGS)[number],
        ),
      );
      assert.equal(isCsaOnlyIntakeSlug(slug), true);
    }
  });

  it("does not mark genuinely borrower-facing slugs as CSA-only", () => {
    for (const slug of [
      "house_sketch",
      "valid_ids",
      "passport",
      "seaman_book",
      "photo_2x2",
      "contract",
    ]) {
      assert.equal(isCsaOnlyIntakeSlug(slug), false);
    }
  });

  it("filters all CSA-only items out of checklist-like arrays, keeps borrower-facing ones", () => {
    const items = [
      { documentTypeSlug: "clearance_form", name: "Clearance" },
      { documentTypeSlug: "declaration_form", name: "Declaration" },
      { documentTypeSlug: "agency_consent_letter", name: "Agency Consent Letter" },
      { documentTypeSlug: "data_privacy_consent", name: "Data Privacy Consent" },
      { documentTypeSlug: "bap_customer_consent", name: "BAP Customer Consent" },
      { documentTypeSlug: "house_sketch", name: "House Sketch" },
    ];
    assert.deepEqual(excludeCsaOnlyIntakeItems(items), [
      { documentTypeSlug: "house_sketch", name: "House Sketch" },
    ]);
  });
});
