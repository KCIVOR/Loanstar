import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COLLECTOR_HISTORY_PAGE_SIZES,
  SYSTEM_TURNOVER_REASON,
  clampCollectorHistoryPageSize,
  sanitizeCollectorHistorySearch,
  toInclusiveEnd,
  toInclusiveStart,
  turnoverReasonLabel,
} from "../history";

describe("COLLECTOR_HISTORY_PAGE_SIZES", () => {
  it("exposes the allowlisted page sizes used by history routes", () => {
    assert.deepEqual([...COLLECTOR_HISTORY_PAGE_SIZES], [10, 20, 30, 50, 100]);
  });
});

describe("clampCollectorHistoryPageSize", () => {
  it("passes through every allowlisted page size", () => {
    for (const size of COLLECTOR_HISTORY_PAGE_SIZES) {
      assert.equal(clampCollectorHistoryPageSize(size), size, String(size));
    }
  });

  it("falls back to 10 for invalid page sizes", () => {
    assert.equal(clampCollectorHistoryPageSize(0), 10);
    assert.equal(clampCollectorHistoryPageSize(15), 10);
    assert.equal(clampCollectorHistoryPageSize(25), 10);
    assert.equal(clampCollectorHistoryPageSize(-1), 10);
    assert.equal(clampCollectorHistoryPageSize(NaN), 10);
  });
});

describe("sanitizeCollectorHistorySearch", () => {
  it("trims, collapses whitespace, and strips % _ , ( )", () => {
    assert.equal(sanitizeCollectorHistorySearch("  Juan  Cruz  "), "Juan Cruz");
    assert.equal(sanitizeCollectorHistorySearch("Juan%Cruz"), "Juan Cruz");
    assert.equal(sanitizeCollectorHistorySearch("Juan_Cruz"), "Juan Cruz");
    assert.equal(sanitizeCollectorHistorySearch("Juan,Cruz"), "Juan Cruz");
    assert.equal(sanitizeCollectorHistorySearch("Juan(Cruz)"), "Juan Cruz");
    assert.equal(
      sanitizeCollectorHistorySearch("  %Juan_,(Cruz)%  "),
      "Juan Cruz",
    );
  });

  it("returns empty when the term is only whitespace or stripped chars", () => {
    assert.equal(sanitizeCollectorHistorySearch(""), "");
    assert.equal(sanitizeCollectorHistorySearch("   "), "");
    assert.equal(sanitizeCollectorHistorySearch("%%%"), "");
    assert.equal(sanitizeCollectorHistorySearch(" _ ,() "), "");
  });
});

describe("toInclusiveStart / toInclusiveEnd", () => {
  it("binds YYYY-MM-DD to start-of-day and end-of-day inclusive timestamps", () => {
    assert.equal(toInclusiveStart("2026-08-01"), "2026-08-01T00:00:00");
    assert.equal(toInclusiveEnd("2026-08-12"), "2026-08-12T23:59:59.999");
  });

  it("does not shift the calendar date", () => {
    assert.equal(toInclusiveStart("2026-01-31"), "2026-01-31T00:00:00");
    assert.equal(toInclusiveEnd("2026-12-31"), "2026-12-31T23:59:59.999");
  });
});

describe("turnoverReasonLabel", () => {
  it("returns the stored reason when present", () => {
    assert.equal(turnoverReasonLabel("aging_91_plus"), "aging_91_plus");
    assert.equal(turnoverReasonLabel("manual"), "manual");
    assert.equal(
      turnoverReasonLabel("  collector reassigned  "),
      "collector reassigned",
    );
  });

  it("falls back to System (aging threshold) when null or empty", () => {
    // Left-join display path: a remedial_turnovers row with blank
    // turnover_reason (aging-cron style) uses SYSTEM_TURNOVER_REASON.
    // Rows with no turnover record are not synthesized here — they are
    // invisible because the turned-over tab sources from_collector_id.
    assert.equal(turnoverReasonLabel(null), SYSTEM_TURNOVER_REASON);
    assert.equal(turnoverReasonLabel(undefined), SYSTEM_TURNOVER_REASON);
    assert.equal(turnoverReasonLabel(""), SYSTEM_TURNOVER_REASON);
    assert.equal(turnoverReasonLabel("   "), SYSTEM_TURNOVER_REASON);
    assert.equal(turnoverReasonLabel("\t\n"), SYSTEM_TURNOVER_REASON);
    assert.equal(SYSTEM_TURNOVER_REASON, "System (aging threshold)");
  });
});

/*
 * KPI `{ total }` (getCollectorClosedAccountsKpiCounts /
 * getCollectorTurnedOverKpiCounts) is date-scoped only — it ignores search.
 * Paid-off is always `account_status=paid AND closed_at IS NOT NULL`.
 * Turned-over is always `from_collector_id`. Those are query invariants,
 * not UI filters; History has no status filter spec.
 *
 * Sort is PostgREST `.order()` (borrower_name / loan_account_no /
 * closed_at or confirmed_at) plus an `id` tiebreaker — not a JS helper.
 *
 * No supabase/PostgREST query-builder mock in this repo (AR/Agent history
 * tests don't either), so KPI counts are documented here rather than mocked.
 */
