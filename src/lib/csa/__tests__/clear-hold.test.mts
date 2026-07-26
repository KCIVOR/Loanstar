import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CLEAR_HOLD_FALLBACK_STATUS,
  resolveStatusAfterClearHold,
} from "../clear-hold";

describe("resolveStatusAfterClearHold", () => {
  it("returns last non-on_hold status before trailing holds", () => {
    const status = resolveStatusAfterClearHold([
      { status: "documents_pending", at: "2026-01-01T00:00:00Z" },
      { status: "submitted", at: "2026-01-02T00:00:00Z" },
      { status: "on_hold", at: "2026-01-03T00:00:00Z" },
      { status: "on_hold", at: "2026-01-04T00:00:00Z" },
    ]);
    assert.equal(status, "submitted");
  });

  it("falls back when history is empty or only on_hold", () => {
    assert.equal(resolveStatusAfterClearHold([]), CLEAR_HOLD_FALLBACK_STATUS);
    assert.equal(
      resolveStatusAfterClearHold([
        { status: "on_hold", at: "2026-01-03T00:00:00Z" },
      ]),
      CLEAR_HOLD_FALLBACK_STATUS,
    );
  });
});
