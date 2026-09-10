import test from "node:test";
import assert from "node:assert/strict";

import {
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

// Which slugs each path/segment generates is covered by
// `release-documents.test.mts` (`templateConditionMatches`, `autoGenerateSlugs`
// over the G1 seed fixture) — the lists are no longer hardcoded in constants.ts.

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
