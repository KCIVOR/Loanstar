import test from "node:test";
import assert from "node:assert/strict";

import {
  REQUIRED_SIGNED_RELEASE_SLUGS,
  missingSignedReleaseSlugs,
  signedReleaseSlugLabels,
} from "../release-service";

test("all three signed scans are required to close", () => {
  assert.deepEqual([...REQUIRED_SIGNED_RELEASE_SLUGS], [
    "signed_check_voucher",
    "signed_promissory_note",
    "signed_disclosure_statement",
  ]);
});

test("missing = every required slug when nothing is uploaded", () => {
  assert.deepEqual(
    missingSignedReleaseSlugs([]),
    [...REQUIRED_SIGNED_RELEASE_SLUGS],
  );
});

test("nothing missing when all three are present", () => {
  const present = [
    "signed_check_voucher",
    "signed_promissory_note",
    "signed_disclosure_statement",
    "some_other_doc",
  ];
  assert.deepEqual(missingSignedReleaseSlugs(present), []);
});

test("the notarized PN cannot be skipped (voucher alone is not enough)", () => {
  const missing = missingSignedReleaseSlugs(["signed_check_voucher"]);
  assert.deepEqual(missing, [
    "signed_promissory_note",
    "signed_disclosure_statement",
  ]);
});

test("labels are human-readable", () => {
  assert.deepEqual(signedReleaseSlugLabels(["signed_promissory_note"]), [
    "signed/notarized promissory note",
  ]);
});
