import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CSA_ONLY_INTAKE_SLUGS,
  excludeCsaOnlyIntakeItems,
  isCsaOnlyIntakeSlug,
} from "../csa-only-intake";

describe("csa-only intake slugs", () => {
  it("marks clearance_form as CSA-only", () => {
    assert.ok(CSA_ONLY_INTAKE_SLUGS.includes("clearance_form"));
    assert.equal(isCsaOnlyIntakeSlug("clearance_form"), true);
    assert.equal(isCsaOnlyIntakeSlug("declaration_form"), false);
  });

  it("filters clearance_form out of checklist-like arrays", () => {
    const items = [
      { documentTypeSlug: "clearance_form", name: "Clearance" },
      { documentTypeSlug: "declaration_form", name: "Declaration" },
    ];
    assert.deepEqual(excludeCsaOnlyIntakeItems(items), [
      { documentTypeSlug: "declaration_form", name: "Declaration" },
    ]);
  });
});
