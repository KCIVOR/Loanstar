import test from "node:test";
import assert from "node:assert/strict";

import {
  AUTO_GENERATED_SLUGS,
  canRecordRelease,
  readyReleaseBlocker,
  releaseStageForPath,
} from "../constants";

test("releaseStageForPath maps paths to signing checklist stages", () => {
  assert.equal(releaseStageForPath("with_pdc"), "signing_with_pdc");
  assert.equal(releaseStageForPath("without_pdc"), "signing_without_pdc");
});

test("Without-PDC path generates cash voucher, not check voucher", () => {
  assert.ok(AUTO_GENERATED_SLUGS.without_pdc.includes("cash_voucher"));
  assert.ok(AUTO_GENERATED_SLUGS.without_pdc.includes("ar_cash_voucher"));
  assert.ok(!AUTO_GENERATED_SLUGS.without_pdc.includes("check_voucher"));
  assert.ok(!AUTO_GENERATED_SLUGS.without_pdc.includes("ar_check_voucher"));
});

test("With-PDC path generates check voucher, not cash voucher", () => {
  assert.ok(AUTO_GENERATED_SLUGS.with_pdc.includes("check_voucher"));
  assert.ok(AUTO_GENERATED_SLUGS.with_pdc.includes("ar_check_voucher"));
  assert.ok(!AUTO_GENERATED_SLUGS.with_pdc.includes("cash_voucher"));
  assert.ok(!AUTO_GENERATED_SLUGS.with_pdc.includes("ar_cash_voucher"));
});

test("canRecordRelease requires borrower briefing sign-off", () => {
  assert.equal(canRecordRelease("ready_release", "2026-07-07T00:00:00Z"), true);
  assert.equal(canRecordRelease("ready_release", null), false);
  assert.equal(canRecordRelease("awaiting_briefing", "2026-07-07T00:00:00Z"), false);
});

test("readyReleaseBlocker uses cash wording for Without-PDC path", () => {
  assert.match(readyReleaseBlocker("without_pdc"), /cash release/i);
  assert.match(readyReleaseBlocker("with_pdc"), /check release/i);
});
