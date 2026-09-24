import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { hasCiContent, individualCiKind } from "../individual-ci";

/** Mirrors `FieldVisitForm`'s `emptyInformants` output. */
function emptyInformants(count: number) {
  return Array.from({ length: count }, () => ({ name: "", address: "" }));
}

/** Mirrors `FieldVisitForm`'s `ensureVisit(null)` skeleton exactly. */
function ensureVisitSkeleton() {
  return {
    header: {},
    residence: { informants: emptyInformants(3) },
    business: { informants: emptyInformants(3) },
    recommendation: {},
  };
}

describe("hasCiContent", () => {
  it("treats empty shapes as empty", () => {
    assert.equal(hasCiContent(null), false);
    assert.equal(hasCiContent(undefined), false);
    assert.equal(hasCiContent({}), false);
    assert.equal(hasCiContent(""), false);
    assert.equal(hasCiContent("  "), false);
    assert.equal(hasCiContent([]), false);
    assert.equal(hasCiContent(emptyInformants(3)), false);
    assert.equal(hasCiContent(ensureVisitSkeleton()), false);
  });

  it("treats real answers — including 0 and false — as content", () => {
    assert.equal(hasCiContent(0), true);
    assert.equal(hasCiContent(false), true);
    assert.equal(hasCiContent("x"), true);
    assert.equal(hasCiContent({ a: { b: "x" } }), true);
    assert.equal(hasCiContent([{ name: "", address: "Cebu" }]), true);
  });
});

describe("individualCiKind", () => {
  it("defaults a missing verification to the new form", () => {
    assert.equal(individualCiKind(null), "field_visit");
    assert.equal(individualCiKind(undefined), "field_visit");
  });

  it("defaults a fresh file with neither form to the new form", () => {
    assert.equal(individualCiKind({}), "field_visit");
    assert.equal(
      individualCiKind({
        fieldVisit: null,
        picVerification: null,
        referenceVerifications: [],
      }),
      "field_visit",
    );
  });

  it("resolves a real field visit to field_visit", () => {
    assert.equal(
      individualCiKind({ fieldVisit: { header: { clientName: "Ana" } } }),
      "field_visit",
    );
  });

  it("resolves legacy PIC data to ci_references", () => {
    assert.equal(
      individualCiKind({ picVerification: { picName: "Ana" } }),
      "ci_references",
    );
    assert.equal(
      individualCiKind({ referenceVerifications: [{ name: "Ben" }] }),
      "ci_references",
    );
  });

  it("does NOT let a blank ensureVisit skeleton hide legacy PIC data", () => {
    assert.equal(
      individualCiKind({
        fieldVisit: ensureVisitSkeleton(),
        picVerification: { picName: "Ana" },
      }),
      "ci_references",
    );
  });

  it("prefers the field visit when both hold real data", () => {
    assert.equal(
      individualCiKind({
        fieldVisit: { header: { clientName: "Ana" } },
        picVerification: { picName: "Ana" },
      }),
      "field_visit",
    );
  });
});
