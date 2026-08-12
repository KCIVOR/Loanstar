import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  csaScreeningCheckSlug,
  normalizeCompanyName,
  normalizePersonName,
} from "../sme-duplication";

describe("normalizeCompanyName", () => {
  it("trims, collapses whitespace, and lowercases", () => {
    assert.equal(normalizeCompanyName("  Acme   Trading  Co  "), "acme trading co");
    assert.equal(normalizeCompanyName(null), "");
    assert.equal(normalizeCompanyName(undefined), "");
  });

  it("treats differently cased names as equal keys", () => {
    assert.equal(
      normalizeCompanyName("ACME TRADING"),
      normalizeCompanyName("acme trading"),
    );
  });
});

describe("normalizePersonName", () => {
  it("joins first/last and normalizes", () => {
    assert.equal(normalizePersonName("Juan", "Dela Cruz"), "juan dela cruz");
    assert.equal(normalizePersonName("  Maria  ", null), "maria");
  });
});

describe("csaScreeningCheckSlug", () => {
  it("returns ncl for Seafarer and sme_duplication for SME", () => {
    assert.equal(csaScreeningCheckSlug("seafarer"), "ncl");
    assert.equal(csaScreeningCheckSlug(null), "ncl");
    assert.equal(csaScreeningCheckSlug(undefined), "ncl");
    assert.equal(csaScreeningCheckSlug("sme"), "sme_duplication");
  });
});
