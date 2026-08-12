import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveDateBounds } from "../DateRangeFilter";

const TODAY = new Date(2026, 7, 11); // 2026-08-11 local

describe("resolveDateBounds", () => {
  it("resolves 30d preset to today minus 30 days, open end", () => {
    assert.deepEqual(
      resolveDateBounds({ preset: "30d", from: "", to: "" }, TODAY),
      { from: "2026-07-12", to: null },
    );
  });

  it("resolves 90d preset to today minus 90 days, open end", () => {
    assert.deepEqual(
      resolveDateBounds({ preset: "90d", from: "", to: "" }, TODAY),
      { from: "2026-05-13", to: null },
    );
  });

  it("resolves all preset to null bounds", () => {
    assert.deepEqual(
      resolveDateBounds({ preset: "all", from: "", to: "" }, TODAY),
      { from: null, to: null },
    );
  });

  it("resolves custom preset from value.from/to (empty → null)", () => {
    assert.deepEqual(
      resolveDateBounds(
        { preset: "custom", from: "2026-01-01", to: "2026-08-11" },
        TODAY,
      ),
      { from: "2026-01-01", to: "2026-08-11" },
    );
    assert.deepEqual(
      resolveDateBounds({ preset: "custom", from: "", to: "" }, TODAY),
      { from: null, to: null },
    );
  });
});
