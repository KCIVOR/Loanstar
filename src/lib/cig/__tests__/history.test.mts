import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CIG_HISTORY_PAGE_SIZES,
  CIG_RETURN_TO_CSA_NOTE_LIKE,
  CIG_RETURN_TO_CSA_NOTE_PREFIX,
  cigRecentMatchesFinding,
  cigRecentMatchesSearch,
  cigRecentMatchesStatus,
  clampCigHistoryPageSize,
  isCigReturnToCsaNote,
  sanitizeCigHistorySearch,
  toInclusiveEnd,
  toInclusiveStart,
} from "../history";

const here = dirname(fileURLToPath(import.meta.url));
const receiptSource = readFileSync(join(here, "..", "receipt.ts"), "utf8");
const returnToCsaViewSql = readFileSync(
  join(
    here,
    "..",
    "..",
    "..",
    "..",
    "supabase",
    "migrations",
    "20260812110000_cig_return_to_csa_view.sql",
  ),
  "utf8",
);

/** Same status_history note `returnToCsa()` writes (`receipt.ts`). */
function returnToCsaStatusNote(note: string): string {
  return `Returned to CSA by CIG — ${note}`;
}

/** Same blocker text `returnToCsa()` writes — a different field, not the view. */
function returnToCsaBlocker(note: string): string {
  return `Returned by CIG: ${note}`;
}

describe("cigRecentMatchesSearch", () => {
  it("matches name, email, and app no", () => {
    const item = {
      applicationNo: "APP-100",
      borrower: {
        borrowerNo: "BN1",
        firstName: "Rovick",
        lastName: "Romasanta",
        email: "rovick@example.com",
      },
    };
    assert.equal(cigRecentMatchesSearch(item, "rovick"), true);
    assert.equal(cigRecentMatchesSearch(item, "APP-100"), true);
    assert.equal(cigRecentMatchesSearch(item, "zzz"), false);
  });
});

describe("cigRecentMatchesFinding", () => {
  it("filters by finding", () => {
    assert.equal(cigRecentMatchesFinding("positive", "all"), true);
    assert.equal(cigRecentMatchesFinding("positive", "positive"), true);
    assert.equal(cigRecentMatchesFinding("negative", "positive"), false);
  });
});

describe("cigRecentMatchesStatus", () => {
  it("filters by status", () => {
    assert.equal(cigRecentMatchesStatus("for_approval", "all"), true);
    assert.equal(cigRecentMatchesStatus("for_approval", "for_approval"), true);
    assert.equal(cigRecentMatchesStatus("denied", "for_approval"), false);
  });
});

describe("CIG_HISTORY_PAGE_SIZES", () => {
  it("exposes the allowlisted page sizes used by history routes", () => {
    assert.deepEqual([...CIG_HISTORY_PAGE_SIZES], [10, 20, 30, 50, 100]);
  });
});

describe("clampCigHistoryPageSize", () => {
  it("passes through every allowlisted page size", () => {
    for (const size of CIG_HISTORY_PAGE_SIZES) {
      assert.equal(clampCigHistoryPageSize(size), size, String(size));
    }
  });

  it("falls back to 10 for invalid page sizes", () => {
    assert.equal(clampCigHistoryPageSize(0), 10);
    assert.equal(clampCigHistoryPageSize(15), 10);
    assert.equal(clampCigHistoryPageSize(25), 10);
    assert.equal(clampCigHistoryPageSize(-1), 10);
    assert.equal(clampCigHistoryPageSize(NaN), 10);
  });
});

describe("sanitizeCigHistorySearch", () => {
  it("trims, collapses whitespace, and strips % _ , ( )", () => {
    assert.equal(sanitizeCigHistorySearch("  Juan  Cruz  "), "Juan Cruz");
    assert.equal(sanitizeCigHistorySearch("Juan%Cruz"), "Juan Cruz");
    assert.equal(sanitizeCigHistorySearch("Juan_Cruz"), "Juan Cruz");
    assert.equal(sanitizeCigHistorySearch("Juan,Cruz"), "Juan Cruz");
    assert.equal(sanitizeCigHistorySearch("Juan(Cruz)"), "Juan Cruz");
    assert.equal(
      sanitizeCigHistorySearch("  %Juan_,(Cruz)%  "),
      "Juan Cruz",
    );
  });

  it("returns empty when the term is only whitespace or stripped chars", () => {
    assert.equal(sanitizeCigHistorySearch(""), "");
    assert.equal(sanitizeCigHistorySearch("   "), "");
    assert.equal(sanitizeCigHistorySearch("%%%"), "");
    assert.equal(sanitizeCigHistorySearch(" _ ,() "), "");
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

describe("cig_return_to_csa_events note LIKE", () => {
  it("uses the exact prefix and LIKE pattern the view WHERE clause uses", () => {
    assert.equal(CIG_RETURN_TO_CSA_NOTE_PREFIX, "Returned to CSA by CIG");
    assert.equal(CIG_RETURN_TO_CSA_NOTE_LIKE, "Returned to CSA by CIG%");
    assert.equal(
      CIG_RETURN_TO_CSA_NOTE_LIKE,
      `${CIG_RETURN_TO_CSA_NOTE_PREFIX}%`,
    );
  });

  it("matches notes built the same way returnToCsa() writes status_history", () => {
    assert.ok(
      receiptSource.includes("`Returned to CSA by CIG — ${note}`"),
      "receipt.ts must still write the status_history note this test builds",
    );
    assert.equal(
      isCigReturnToCsaNote(returnToCsaStatusNote("missing employment docs")),
      true,
    );
    assert.equal(
      isCigReturnToCsaNote(returnToCsaStatusNote("incomplete CI pack")),
      true,
    );
    assert.equal(isCigReturnToCsaNote(CIG_RETURN_TO_CSA_NOTE_PREFIX), true);
  });

  it("does not match the blocker field returnToCsa() writes", () => {
    assert.ok(
      receiptSource.includes("`Returned by CIG: ${note}`"),
      "receipt.ts must still write the blocker this test builds",
    );
    assert.equal(
      isCigReturnToCsaNote(returnToCsaBlocker("missing employment docs")),
      false,
    );
  });

  it("is case-sensitive like Postgres LIKE, not ILIKE", () => {
    assert.equal(
      isCigReturnToCsaNote("returned to csa by cig — x"),
      false,
    );
    assert.equal(
      isCigReturnToCsaNote("RETURNED TO CSA BY CIG — x"),
      false,
    );
  });

  it("rejects unrelated, null, and empty notes", () => {
    assert.equal(isCigReturnToCsaNote(null), false);
    assert.equal(isCigReturnToCsaNote(undefined), false);
    assert.equal(isCigReturnToCsaNote(""), false);
    assert.equal(isCigReturnToCsaNote("Forwarded to committee"), false);
    assert.equal(
      isCigReturnToCsaNote("Please review: Returned to CSA by CIG — x"),
      false,
    );
  });

  it("matches the view migration's exact LIKE predicate", () => {
    assert.ok(
      returnToCsaViewSql.includes(`LIKE '${CIG_RETURN_TO_CSA_NOTE_LIKE}'`),
      "view WHERE must use LIKE with CIG_RETURN_TO_CSA_NOTE_LIKE",
    );
    assert.equal(
      /ILIKE\s+'Returned to CSA by CIG%/i.test(returnToCsaViewSql),
      false,
    );
  });
});

/*
 * KPI `{ total }` (getCigForwardedKpiCounts / getCigReturnedKpiCounts /
 * getCigDenialCallsKpiCounts / getCigCallbacksResolvedKpiCounts) is
 * date-scoped only — it ignores search and (on Forwarded) finding.
 *
 * Forwarded finding chips are covered by cigRecentMatchesFinding (no
 * separate exported filter-spec helper). Other tabs have no extra chip
 * filter. Sort is PostgREST `.order()` plus an `id` tiebreaker — not a
 * JS helper.
 *
 * No supabase/PostgREST query-builder mock in this repo (AR/Collector
 * history tests don't either), so KPI counts are documented here rather
 * than mocked.
 */
