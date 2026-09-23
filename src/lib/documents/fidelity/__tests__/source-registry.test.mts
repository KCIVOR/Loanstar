import test from "node:test";
import assert from "node:assert/strict";

import {
  findSourceVariant,
  listSourceVariants,
} from "../source-registry";

test("finds the SF disclosure source without variant dimensions", () => {
  const variant = findSourceVariant({
    family: "sf-disclosure-statement",
    dimensions: {},
  });

  assert.deepEqual(variant, {
    id: "sf-disclosure-statement",
    family: "sf-disclosure-statement",
    requiredVariantDimensions: {},
    templateSlug: "disclosure_statement",
    sourcePath: "C:/Users/Rovick/Downloads/SFCalculator/DISC.doc",
    pageTarget: 1,
  });
});

test("finds the correct SF ATM source for spouse and non-spouse variants", () => {
  const noSpouse = findSourceVariant({
    family: "sf-atm-acknowledgement-receipt",
    dimensions: { hasSpouse: false },
  });
  const withSpouse = findSourceVariant({
    family: "sf-atm-acknowledgement-receipt",
    dimensions: { hasSpouse: true },
  });

  assert.equal(noSpouse?.sourcePath, "C:/Users/Rovick/Downloads/SFCalculator/AR ATM.doc");
  assert.equal(withSpouse?.sourcePath, "C:/Users/Rovick/Downloads/SFCalculator/AR ATM - With Spouse.doc");
});

test("returns null when a required source variant dimension is absent", () => {
  assert.equal(
    findSourceVariant({
      family: "sf-atm-acknowledgement-receipt",
      dimensions: {},
    }),
    null,
  );
});

test("returns null when a lookup supplies unexpected variant dimensions", () => {
  assert.equal(
    findSourceVariant({
      family: "sf-atm-acknowledgement-receipt",
      dimensions: { hasSpouse: false, collateralCount: 1 },
    }),
    null,
  );
});

test("does not let consumers mutate listed registry entries", () => {
  const [first] = listSourceVariants();

  assert.throws(() => {
    first.templateSlug = "mutated";
  }, TypeError);
  assert.equal(listSourceVariants()[0].templateSlug, "disclosure_statement");
});

test("never selects a source from a Backup directory", () => {
  for (const variant of listSourceVariants()) {
    assert.doesNotMatch(variant.sourcePath, /[/\\]Backup[/\\]/i);
  }
});

test("represents a page target only for variants established by source inspection", () => {
  const variants = listSourceVariants();
  const disclosure = variants.find((variant) => variant.id === "sf-disclosure-statement");

  assert.equal(disclosure?.pageTarget, 1);
  assert.equal(Object.hasOwn(disclosure ?? {}, "pageTarget"), true);

  for (const variant of variants.filter((entry) => entry.id !== "sf-disclosure-statement")) {
    assert.equal(Object.hasOwn(variant, "pageTarget"), false);
  }
});
