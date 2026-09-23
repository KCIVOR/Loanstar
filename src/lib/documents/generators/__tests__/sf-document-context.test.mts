import test from "node:test";
import assert from "node:assert/strict";

import { resolveSfDocumentSource } from "../sf-document-context";

test("resolves the SF Disclosure Statement source", () => {
  const source = resolveSfDocumentSource({ kind: "disclosure" });

  assert.equal(source?.id, "sf-disclosure-statement");
  assert.equal(source?.templateSlug, "disclosure_statement");
});

test("resolves the SF Promissory Note source", () => {
  const source = resolveSfDocumentSource({ kind: "promissory_note" });

  assert.equal(source?.id, "sf-promissory-note");
  assert.equal(source?.templateSlug, "promissory_note");
});

test("resolves the address-free SF second demand notice source", () => {
  const source = resolveSfDocumentSource({ kind: "demand_letter_second" });

  assert.equal(source?.id, "sf-demand-letter-second-notice");
  assert.equal(source?.templateSlug, "demand_letter_second_notice");
});

test("resolves the SF ATM source with spouse", () => {
  const source = resolveSfDocumentSource({ kind: "ar_atm", hasSpouse: true });

  assert.equal(source?.id, "sf-atm-acknowledgement-receipt-with-spouse");
});

test("resolves the SF ATM source without spouse", () => {
  const source = resolveSfDocumentSource({ kind: "ar_atm", hasSpouse: false });

  assert.equal(source?.id, "sf-atm-acknowledgement-receipt-no-spouse");
});

test("returns null for an ATM request that does not state spouse status", () => {
  assert.equal(resolveSfDocumentSource({ kind: "ar_atm" }), null);
});

test("returns null for unsupported or incomplete SF document inputs", () => {
  assert.equal(resolveSfDocumentSource({ kind: "unsupported" as never }), null);
  assert.equal(resolveSfDocumentSource({}), null);
  assert.equal(resolveSfDocumentSource(null), null);
});
