import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  committeeSizeConfigKey,
  resolveCommitteeSize,
} from "../committee-size";

describe("committeeSizeConfigKey", () => {
  it("maps seafarer → committee_size", () => {
    assert.equal(committeeSizeConfigKey("seafarer"), "committee_size");
  });

  it("maps sme → committee_size_sme", () => {
    assert.equal(committeeSizeConfigKey("sme"), "committee_size_sme");
  });

  it("refuses NULL/unknown — must not silently mean Seafarer", () => {
    assert.throws(() => committeeSizeConfigKey(null), /missing or unknown/);
    assert.throws(
      () => committeeSizeConfigKey(undefined),
      /missing or unknown/,
    );
    assert.throws(() => committeeSizeConfigKey(""), /missing or unknown/);
    assert.throws(() => committeeSizeConfigKey("other"), /missing or unknown/);
  });
});

describe("resolveCommitteeSize", () => {
  const sizes = { seafarer: 3, sme: 1 };

  it("returns segment-specific sizes", () => {
    assert.equal(resolveCommitteeSize("seafarer", sizes), 3);
    assert.equal(resolveCommitteeSize("sme", sizes), 1);
  });
});
