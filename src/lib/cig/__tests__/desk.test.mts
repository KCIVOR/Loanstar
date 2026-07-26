import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cigMatchesWorkFilter,
  cigNeedsAttention,
  cigNextActionLabel,
  daysSince,
  isSameCalendarDay,
} from "../desk";

describe("isSameCalendarDay", () => {
  it("matches same local calendar day", () => {
    const asOf = new Date(2026, 6, 10, 20, 0, 0);
    const sameDay = new Date(2026, 6, 10, 8, 0, 0).toISOString();
    assert.equal(isSameCalendarDay(sameDay, asOf), true);
  });

  it("rejects a different local day", () => {
    const asOf = new Date(2026, 6, 10, 12, 0, 0);
    const otherDay = new Date(2026, 6, 9, 23, 0, 0).toISOString();
    assert.equal(isSameCalendarDay(otherDay, asOf), false);
  });
});

describe("daysSince", () => {
  it("counts whole days", () => {
    assert.equal(
      daysSince(
        "2026-07-01T00:00:00.000Z",
        new Date("2026-07-10T12:00:00.000Z"),
      ),
      9,
    );
  });

  it("returns null when missing", () => {
    assert.equal(daysSince(null), null);
  });
});

describe("cigNeedsAttention", () => {
  it("flags revision or overdue callback", () => {
    assert.equal(
      cigNeedsAttention({ isRevision: true, callbackOverdueAt: null }),
      true,
    );
    assert.equal(
      cigNeedsAttention({
        isRevision: false,
        callbackOverdueAt: "2026-07-01",
      }),
      true,
    );
    assert.equal(
      cigNeedsAttention({ isRevision: false, callbackOverdueAt: null }),
      false,
    );
  });
});

describe("cigMatchesWorkFilter", () => {
  it("filters revisions and overdue", () => {
    assert.equal(
      cigMatchesWorkFilter(
        {
          isRevision: true,
          callbackOverdueAt: null,
          endorsedAt: null,
        },
        "revisions",
      ),
      true,
    );
    assert.equal(
      cigMatchesWorkFilter(
        {
          isRevision: false,
          callbackOverdueAt: "2026-07-01",
          endorsedAt: null,
        },
        "callback_overdue",
      ),
      true,
    );
  });
});

describe("cigNextActionLabel", () => {
  it("prioritizes overdue callback", () => {
    assert.match(
      cigNextActionLabel({
        isRevision: true,
        callbackOverdueAt: "2026-07-01",
      }),
      /callback/i,
    );
  });
});
