import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { isCigEditableStage } from "../edit-stage";

describe("isCigEditableStage", () => {
  it("allows editing while the file is in verification", () => {
    assert.equal(isCigEditableStage("for_verification", null), true);
  });

  it("allows editing after Committee returns the file to CIG", () => {
    assert.equal(isCigEditableStage("for_revision", { routeTo: "cig" }), true);
  });

  it("stays locked when the return is routed to CSA", () => {
    assert.equal(isCigEditableStage("for_revision", { routeTo: "csa" }), false);
  });

  it("stays locked for a revision with no open notice", () => {
    assert.equal(isCigEditableStage("for_revision", null), false);
    assert.equal(isCigEditableStage("for_revision", undefined), false);
  });

  it("stays locked for every other status", () => {
    for (const status of [
      "submitted",
      "for_approval",
      "approved",
      "denied",
      "committee_hold",
      "negotiating_terms",
    ]) {
      assert.equal(isCigEditableStage(status, { routeTo: "cig" }), false, status);
    }
  });
});

describe("CIG routes keep the right guard", () => {
  const read = (rel: string) =>
    readFileSync(new URL(rel, import.meta.url), "utf8");
  const apiDir = "../../../app/api/cig/applications/[id]/";

  it("uses the edit guard for saving the form and recording checks", () => {
    assert.match(read(`${apiDir}route.ts`), /assertCigEditStage\(supabase, id\)/);
    assert.match(read(`${apiDir}checks/route.ts`), /assertCigEditStage\(supabase, id\)/);
  });

  it("keeps forward, return, cancel and callback on the verification-only guard", () => {
    for (const route of ["forward", "return", "cancel", "callback"]) {
      const src = read(`${apiDir}${route}/route.ts`);
      assert.match(src, /assertCigVerificationStage\(supabase, id\)/, route);
      assert.doesNotMatch(src, /assertCigEditStage/, route);
    }
  });
});
