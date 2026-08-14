import test from "node:test";
import assert from "node:assert/strict";

import {
  AUTO_GENERATED_SLUGS,
  canRecordRelease,
  readyReleaseBlocker,
  releaseStageForPath,
  releaseStagesForPaths,
} from "../constants";

test("releaseStageForPath maps paths to signing checklist stages", () => {
  assert.equal(releaseStageForPath("with_pdc"), "signing_with_pdc");
  assert.equal(releaseStageForPath("without_pdc"), "signing_without_pdc");
});

test("releaseStagesForPaths maps each path through releaseStageForPath", () => {
  assert.deepEqual(releaseStagesForPaths(["with_pdc"]), ["signing_with_pdc"]);
  assert.deepEqual(releaseStagesForPaths(["without_pdc"]), [
    "signing_without_pdc",
  ]);
  assert.deepEqual(releaseStagesForPaths(["with_pdc", "without_pdc"]), [
    "signing_with_pdc",
    "signing_without_pdc",
  ]);
});

test("Without-PDC path generates cash + AR ATM voucher, not check voucher", () => {
  assert.ok(AUTO_GENERATED_SLUGS.without_pdc.includes("cash_voucher"));
  assert.ok(AUTO_GENERATED_SLUGS.without_pdc.includes("ar_atm_voucher"));
  assert.ok(!AUTO_GENERATED_SLUGS.without_pdc.includes("ar_cash_voucher"));
  assert.ok(!AUTO_GENERATED_SLUGS.without_pdc.includes("check_voucher"));
  assert.ok(!AUTO_GENERATED_SLUGS.without_pdc.includes("ar_check_voucher"));
});

test("With-PDC path generates check voucher, not cash/ATM AR voucher", () => {
  assert.ok(AUTO_GENERATED_SLUGS.with_pdc.includes("check_voucher"));
  assert.ok(AUTO_GENERATED_SLUGS.with_pdc.includes("ar_check_voucher"));
  assert.ok(!AUTO_GENERATED_SLUGS.with_pdc.includes("cash_voucher"));
  assert.ok(!AUTO_GENERATED_SLUGS.with_pdc.includes("ar_cash_voucher"));
  assert.ok(!AUTO_GENERATED_SLUGS.with_pdc.includes("ar_atm_voucher"));
});

test("both paths generate 7 docs including Letter of Intent and Loan Agreement (Phase 11)", () => {
  assert.equal(AUTO_GENERATED_SLUGS.with_pdc.length, 7);
  assert.equal(AUTO_GENERATED_SLUGS.without_pdc.length, 7);
  for (const path of ["with_pdc", "without_pdc"] as const) {
    assert.ok(AUTO_GENERATED_SLUGS[path].includes("letter_of_intent"));
    assert.ok(AUTO_GENERATED_SLUGS[path].includes("loan_agreement"));
  }
});

test("all-signed gate treats a full 7-doc set as complete (Phase 11)", () => {
  const withPdc = AUTO_GENERATED_SLUGS.with_pdc.map((slug) => ({
    slug,
    signed_at: "2026-07-17T00:00:00Z",
  }));
  assert.equal(withPdc.length, 7);
  assert.ok(withPdc.every((d) => Boolean(d.signed_at)));

  const incomplete = withPdc.map((d, i) =>
    i === 0 ? { ...d, signed_at: null } : d,
  );
  assert.equal(
    incomplete.every((d) => Boolean(d.signed_at)),
    false,
  );
});

test("canRecordRelease requires borrower briefing sign-off", () => {
  assert.equal(canRecordRelease("ready_release", "2026-07-07T00:00:00Z"), true);
  assert.equal(canRecordRelease("ready_release", null), false);
  assert.equal(canRecordRelease("awaiting_briefing", "2026-07-07T00:00:00Z"), false);
});

test("readyReleaseBlocker uses path-set wording", () => {
  assert.match(readyReleaseBlocker(["without_pdc"]), /cash release/i);
  assert.match(readyReleaseBlocker(["with_pdc"]), /check release/i);
  assert.match(
    readyReleaseBlocker(["with_pdc", "without_pdc"]),
    /check and cash release/i,
  );
  assert.match(readyReleaseBlocker(null), /check release/i);
});
