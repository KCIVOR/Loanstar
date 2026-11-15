import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { isVerificationForwarded } from "../workspace";

describe("isVerificationForwarded", () => {
  it("is forwarded on the first pass (forwarded after endorsed)", () => {
    assert.equal(
      isVerificationForwarded("2026-11-16T02:00:00Z", "2026-11-16T01:00:00Z"),
      true,
    );
  });

  it("is not forwarded after CSA re-endorses (endorsed after forwarded)", () => {
    assert.equal(
      isVerificationForwarded("2026-11-16T02:00:00Z", "2026-11-16T03:00:00Z"),
      false,
    );
  });

  it("is forwarded when both times are equal", () => {
    assert.equal(
      isVerificationForwarded("2026-11-16T02:00:00Z", "2026-11-16T02:00:00Z"),
      true,
    );
  });

  it("keeps the plain behaviour for older rows with no endorse date", () => {
    assert.equal(isVerificationForwarded("2026-11-16T02:00:00Z", null), true);
    assert.equal(isVerificationForwarded("2026-11-16T02:00:00Z", undefined), true);
  });

  it("is not forwarded when never submitted", () => {
    assert.equal(isVerificationForwarded(null, "2026-11-16T01:00:00Z"), false);
    assert.equal(isVerificationForwarded(undefined, null), false);
  });

  it("falls back to forwarded when a date cannot be read", () => {
    assert.equal(isVerificationForwarded("not-a-date", "2026-11-16T01:00:00Z"), true);
  });
});

describe("forward.ts uses the round-aware rule", () => {
  const src = readFileSync(new URL("../forward.ts", import.meta.url), "utf8");

  it("checks the already-submitted guard with the helper, not forwardedAt alone", () => {
    assert.match(src, /isVerificationForwarded\(/);
    assert.doesNotMatch(src, /if \(verification\.forwardedAt\)/);
  });

  it("still never clears forwarded_at", () => {
    assert.doesNotMatch(src, /forwarded_at:\s*null/);
  });
});
