import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { agingNeedsAttention } from "../desk";
import {
  COLLECTOR_AGING_FILTERS,
  COLLECTOR_QUEUE_ACCOUNT_STATUS,
  COLLECTOR_QUEUE_PAGE_SIZES,
  agingFilterSpec,
  callbackDue,
  clampCollectorQueuePageSize,
  collectorSearchPredicate,
  computeCollectorQueueKpis,
  inFirstPaymentBounds,
  passesAgingFilter,
  passesSegmentFilter,
  sanitizeSearchTerm,
  segmentFilterSpec,
  sortCollectorQueue,
  type CollectorAgingFilter,
  type CollectorQueueMappedRow,
} from "../queue";

const here = dirname(fileURLToPath(import.meta.url));
const accountsRouteSource = readFileSync(
  join(here, "..", "..", "..", "app", "api", "collector", "accounts", "route.ts"),
  "utf8",
);

function row(
  overrides: Partial<CollectorQueueMappedRow> & { id: string },
): CollectorQueueMappedRow {
  return {
    id: overrides.id,
    borrowerId: overrides.borrowerId ?? "borrower-1",
    borrowerName: overrides.borrowerName ?? "Borrower",
    borrowerNo: overrides.borrowerNo ?? "B-001",
    loanAccountNo: overrides.loanAccountNo ?? "LA-001",
    segment: overrides.segment ?? "seafarer",
    manningAgency: overrides.manningAgency ?? null,
    vesselName: overrides.vesselName ?? null,
    outstandingBalance: overrides.outstandingBalance ?? 0,
    agingBucket: overrides.agingBucket ?? "current",
    firstPaymentDate: overrides.firstPaymentDate ?? null,
    nextDueDate: overrides.nextDueDate ?? null,
    nextDueAmount: overrides.nextDueAmount ?? null,
    lastContact: overrides.lastContact ?? null,
  };
}

describe("COLLECTOR_QUEUE_ACCOUNT_STATUS", () => {
  it("is the active status used to exclude paid-off accounts from the queue", () => {
    assert.equal(COLLECTOR_QUEUE_ACCOUNT_STATUS, "active");
  });
});

describe("paid exclusion is SQL-only on GET /api/collector/accounts", () => {
  it("filters masterlist with account_status = COLLECTOR_QUEUE_ACCOUNT_STATUS", () => {
    assert.match(
      accountsRouteSource,
      /\.eq\(\s*"account_status"\s*,\s*COLLECTOR_QUEUE_ACCOUNT_STATUS\s*\)/,
    );
  });

  it("still excludes remedial accounts via remedial_flag false", () => {
    assert.match(
      accountsRouteSource,
      /\.eq\(\s*"remedial_flag"\s*,\s*false\s*\)/,
    );
  });

  it("does not use closed_at IS NULL as the paid-exclusion substitute", () => {
    assert.equal(accountsRouteSource.includes('.is("closed_at"'), false);
    assert.equal(accountsRouteSource.includes(".is('closed_at'"), false);
  });
});

describe("COLLECTOR_QUEUE_PAGE_SIZES", () => {
  it("exposes the allowlisted page sizes used by the queue route", () => {
    assert.deepEqual([...COLLECTOR_QUEUE_PAGE_SIZES], [10, 20, 30, 50, 100]);
  });
});

describe("clampCollectorQueuePageSize", () => {
  it("passes through every allowlisted page size", () => {
    for (const size of COLLECTOR_QUEUE_PAGE_SIZES) {
      assert.equal(clampCollectorQueuePageSize(size), size, String(size));
    }
  });

  it("falls back to 10 for invalid page sizes", () => {
    assert.equal(clampCollectorQueuePageSize(0), 10);
    assert.equal(clampCollectorQueuePageSize(15), 10);
    assert.equal(clampCollectorQueuePageSize(NaN), 10);
    assert.equal(clampCollectorQueuePageSize(25), 10);
    assert.equal(clampCollectorQueuePageSize(-1), 10);
  });
});

describe("agingFilterSpec", () => {
  it("maps aging filters to the AR bucket chips, else all", () => {
    assert.equal(agingFilterSpec("all"), "all");
    assert.equal(agingFilterSpec(""), "all");
    assert.equal(agingFilterSpec("current"), "current");
    assert.equal(agingFilterSpec("1-30"), "1-30");
    assert.equal(agingFilterSpec("31-60"), "31-60");
    assert.equal(agingFilterSpec("61-90"), "61-90");
    assert.equal(agingFilterSpec("91+"), "91+");
  });

  it("maps every /collector/accounts Aging chip id the page exposes", () => {
    // Mirrors AGING_CHIPS in src/app/collector/accounts/page.tsx.
    const pageAgingChips = [
      "all",
      "current",
      "1-30",
      "31-60",
      "61-90",
      "91+",
    ] as const;
    assert.deepEqual([...COLLECTOR_AGING_FILTERS], [...pageAgingChips]);
    for (const id of pageAgingChips) {
      assert.equal(agingFilterSpec(id), id);
    }
  });

  it("falls back to all for unknown values", () => {
    assert.equal(agingFilterSpec("unknown"), "all");
    assert.equal(agingFilterSpec("overdue"), "all");
    assert.equal(agingFilterSpec("91"), "all");
  });
});

describe("passesAgingFilter ↔ agingFilterSpec", () => {
  const buckets: Exclude<CollectorAgingFilter, "all">[] = [
    "current",
    "1-30",
    "31-60",
    "61-90",
    "91+",
  ];

  it("lets every bucket through when spec is all", () => {
    for (const bucket of buckets) {
      assert.equal(
        passesAgingFilter(bucket, agingFilterSpec("all")),
        true,
        bucket,
      );
    }
  });

  it("matches only the requested aging bucket", () => {
    for (const bucket of buckets) {
      for (const chip of buckets) {
        assert.equal(
          passesAgingFilter(bucket, agingFilterSpec(chip)),
          bucket === chip,
          `${bucket} vs ${chip}`,
        );
      }
    }
  });
});

describe("sanitizeSearchTerm", () => {
  it("trims, collapses whitespace, and strips %_,()", () => {
    assert.equal(sanitizeSearchTerm("  Juan  Cruz  "), "Juan Cruz");
    assert.equal(sanitizeSearchTerm("Juan%Cruz"), "Juan Cruz");
    assert.equal(sanitizeSearchTerm("Juan_Cruz"), "Juan Cruz");
    assert.equal(sanitizeSearchTerm("Juan,Cruz"), "Juan Cruz");
    assert.equal(sanitizeSearchTerm("Juan(Cruz)"), "Juan Cruz");
  });
});

describe("collectorSearchPredicate", () => {
  const sample = row({
    id: "1",
    borrowerName: "Juan Cruz",
    borrowerNo: "B-100",
    loanAccountNo: "LA-999",
    manningAgency: "Ocean Manning",
    vesselName: "MV Horizon",
  });

  it("matches empty / whitespace / sanitized-empty terms", () => {
    assert.equal(collectorSearchPredicate(sample, ""), true);
    assert.equal(collectorSearchPredicate(sample, "   "), true);
    assert.equal(collectorSearchPredicate(sample, "%%%"), true);
  });

  it("matches borrower name, borrower no, and account no", () => {
    assert.equal(collectorSearchPredicate(sample, "juan"), true);
    assert.equal(collectorSearchPredicate(sample, "B-100"), true);
    assert.equal(collectorSearchPredicate(sample, "LA-999"), true);
    assert.equal(collectorSearchPredicate(sample, "nope"), false);
  });

  it("matches secondary identity (manning agency / vessel)", () => {
    assert.equal(collectorSearchPredicate(sample, "ocean"), true);
    assert.equal(collectorSearchPredicate(sample, "horizon"), true);
    assert.equal(collectorSearchPredicate(sample, "manning · mv"), true);
  });

  it("sanitizes the term before matching", () => {
    assert.equal(collectorSearchPredicate(sample, "Juan%Cruz"), true);
    assert.equal(collectorSearchPredicate(sample, "(B-100)"), true);
    assert.equal(collectorSearchPredicate(sample, "Ocean,(Manning)"), true);
  });
});

describe("callbackDue", () => {
  const now = Date.parse("2026-08-12T12:00:00.000Z");

  it("is false when contact or callbackAt is null", () => {
    assert.equal(callbackDue(null, now), false);
    assert.equal(callbackDue(undefined, now), false);
    assert.equal(callbackDue({ callbackAt: null }, now), false);
  });

  it("is false when callbackAt is in the future relative to injected now", () => {
    assert.equal(
      callbackDue({ callbackAt: "2026-08-12T12:00:01.000Z" }, now),
      false,
    );
    assert.equal(
      callbackDue({ callbackAt: "2026-08-12T12:00:00.000Z" }, now),
      false,
    );
  });

  it("is true when callbackAt is in the past relative to injected now", () => {
    assert.equal(
      callbackDue({ callbackAt: "2026-08-12T11:59:59.000Z" }, now),
      true,
    );
    assert.equal(
      callbackDue({ callbackAt: "2026-08-01T00:00:00.000Z" }, now),
      true,
    );
  });
});

describe("inFirstPaymentBounds", () => {
  it("passes all rows when both bounds are null", () => {
    assert.equal(inFirstPaymentBounds(null, null, null), true);
    assert.equal(inFirstPaymentBounds("2026-08-01", null, null), true);
  });

  it("excludes null first-payment dates once a bound is set", () => {
    assert.equal(inFirstPaymentBounds(null, "2026-08-01", null), false);
    assert.equal(inFirstPaymentBounds(null, null, "2026-08-31"), false);
  });

  it("applies inclusive date-only YYYY-MM-DD bounds on the from/to day", () => {
    assert.equal(
      inFirstPaymentBounds("2026-08-01", "2026-08-01", "2026-08-01"),
      true,
    );
    assert.equal(
      inFirstPaymentBounds("2026-07-31", "2026-08-01", null),
      false,
    );
    assert.equal(
      inFirstPaymentBounds("2026-08-02", null, "2026-08-01"),
      false,
    );
  });

  it("still includes a timestamp that already has a time component on the bound day", () => {
    assert.equal(
      inFirstPaymentBounds(
        "2026-08-01T15:30:00",
        "2026-08-01",
        "2026-08-01",
      ),
      true,
    );
  });
});

describe("sortCollectorQueue", () => {
  const now = Date.parse("2026-08-12T12:00:00.000Z");
  const pastContact = {
    contactType: "call",
    callbackAt: "2026-08-12T11:00:00.000Z",
    createdAt: "2026-08-11T00:00:00.000Z",
  };
  const futureContact = {
    contactType: "call",
    callbackAt: "2026-08-13T00:00:00.000Z",
    createdAt: "2026-08-11T00:00:00.000Z",
  };

  const rows: CollectorQueueMappedRow[] = [
    row({
      id: "cb-a-900",
      borrowerName: "Zed",
      outstandingBalance: 900,
      agingBucket: "91+",
      nextDueDate: "2026-09-01",
      lastContact: pastContact,
    }),
    row({
      id: "cb-a-100",
      borrowerName: "Mia",
      outstandingBalance: 100,
      agingBucket: "1-30",
      nextDueDate: "2026-08-20",
      lastContact: pastContact,
    }),
    row({
      id: "cb-ok-500",
      borrowerName: "Ann",
      outstandingBalance: 500,
      agingBucket: "current",
      nextDueDate: null,
      lastContact: pastContact,
    }),
    row({
      id: "attn-800",
      borrowerName: "Ben",
      outstandingBalance: 800,
      agingBucket: "31-60",
      nextDueDate: "2026-12-31",
      lastContact: futureContact,
    }),
    row({
      id: "attn-50",
      borrowerName: "Cal",
      outstandingBalance: 50,
      agingBucket: "61-90",
      nextDueDate: "2026-08-15",
      lastContact: null,
    }),
    row({
      id: "ok-999",
      borrowerName: "Dan",
      outstandingBalance: 999,
      agingBucket: "current",
      nextDueDate: "2026-07-01",
      lastContact: null,
    }),
    row({
      id: "ok-10",
      borrowerName: "Eve",
      outstandingBalance: 10,
      agingBucket: "current",
      nextDueDate: "2026-10-01",
      lastContact: null,
    }),
  ];

  it("sorts priority by callback-due, then agingNeedsAttention, then balance desc", () => {
    const sorted = sortCollectorQueue(rows, "priority", "asc", now);
    assert.deepEqual(
      sorted.map((r) => r.id),
      [
        "cb-a-900",
        "cb-a-100",
        "cb-ok-500",
        "attn-800",
        "attn-50",
        "ok-999",
        "ok-10",
      ],
    );
  });

  it("does not reverse priority order when sortDir is desc", () => {
    const asc = sortCollectorQueue(rows, "priority", "asc", now).map(
      (r) => r.id,
    );
    const desc = sortCollectorQueue(rows, "priority", "desc", now).map(
      (r) => r.id,
    );
    assert.deepEqual(desc, asc);
  });

  it("sorts balance by outstandingBalance with sortDir", () => {
    assert.deepEqual(
      sortCollectorQueue(rows, "balance", "asc", now).map((r) => r.id),
      [
        "ok-10",
        "attn-50",
        "cb-a-100",
        "cb-ok-500",
        "attn-800",
        "cb-a-900",
        "ok-999",
      ],
    );
    assert.deepEqual(
      sortCollectorQueue(rows, "balance", "desc", now).map((r) => r.id),
      [
        "ok-999",
        "cb-a-900",
        "attn-800",
        "cb-ok-500",
        "cb-a-100",
        "attn-50",
        "ok-10",
      ],
    );
  });

  it("sorts borrower by name with sortDir", () => {
    assert.deepEqual(
      sortCollectorQueue(rows, "borrower", "asc", now).map((r) => r.id),
      [
        "cb-ok-500",
        "attn-800",
        "attn-50",
        "ok-999",
        "ok-10",
        "cb-a-100",
        "cb-a-900",
      ],
    );
    assert.deepEqual(
      sortCollectorQueue(rows, "borrower", "desc", now).map((r) => r.id),
      [
        "cb-a-900",
        "cb-a-100",
        "ok-10",
        "ok-999",
        "attn-50",
        "attn-800",
        "cb-ok-500",
      ],
    );
  });

  it("sorts due by nextDueDate, treating null as 9999", () => {
    assert.deepEqual(
      sortCollectorQueue(rows, "due", "asc", now).map((r) => r.id),
      [
        "ok-999",
        "attn-50",
        "cb-a-100",
        "cb-a-900",
        "ok-10",
        "attn-800",
        "cb-ok-500",
      ],
    );
    assert.deepEqual(
      sortCollectorQueue(rows, "due", "desc", now).map((r) => r.id),
      [
        "cb-ok-500",
        "attn-800",
        "ok-10",
        "cb-a-900",
        "cb-a-100",
        "attn-50",
        "ok-999",
      ],
    );
  });
});

describe("sort/priority uses desk.ts agingNeedsAttention", () => {
  it("does not reimplement the aging flag — feeds the shared helper", () => {
    assert.equal(agingNeedsAttention("current"), false);
    assert.equal(agingNeedsAttention("91+"), true);

    const now = Date.parse("2026-08-12T12:00:00.000Z");
    const mixed = [
      row({
        id: "ok",
        agingBucket: "current",
        outstandingBalance: 999,
        lastContact: null,
      }),
      row({
        id: "attn",
        agingBucket: "1-30",
        outstandingBalance: 1,
        lastContact: null,
      }),
    ];
    const viaHelper = sortCollectorQueue(mixed, "priority", "asc", now);
    const byFlag = [...mixed].sort((a, b) => {
      const aFlag = agingNeedsAttention(a.agingBucket) ? 0 : 1;
      const bFlag = agingNeedsAttention(b.agingBucket) ? 0 : 1;
      if (aFlag !== bFlag) return aFlag - bFlag;
      return b.outstandingBalance - a.outstandingBalance;
    });
    assert.deepEqual(
      viaHelper.map((r) => r.id),
      byFlag.map((r) => r.id),
    );
    assert.deepEqual(
      viaHelper.map((r) => r.id),
      ["attn", "ok"],
    );
  });
});

describe("computeCollectorQueueKpis", () => {
  const now = Date.parse("2026-08-12T12:00:00.000Z");

  it("returns zeros for an empty set", () => {
    assert.deepEqual(computeCollectorQueueKpis([], now), {
      assigned: 0,
      callbackDue: 0,
      agingCritical: 0,
      totalBalance: 0,
    });
  });

  it("counts assigned / callbackDue / agingCritical and sums totalBalance", () => {
    const kpis = computeCollectorQueueKpis(
      [
        row({
          id: "a",
          outstandingBalance: 100,
          agingBucket: "91+",
          lastContact: {
            contactType: "call",
            callbackAt: "2026-08-12T11:00:00.000Z",
            createdAt: "2026-08-11T00:00:00.000Z",
          },
        }),
        row({
          id: "b",
          outstandingBalance: 50,
          agingBucket: "current",
          lastContact: {
            contactType: "sms",
            callbackAt: "2026-08-13T00:00:00.000Z",
            createdAt: "2026-08-11T00:00:00.000Z",
          },
        }),
        row({
          id: "c",
          outstandingBalance: 25,
          agingBucket: "1-30",
          lastContact: null,
        }),
      ],
      now,
    );
    assert.deepEqual(kpis, {
      assigned: 3,
      callbackDue: 1,
      agingCritical: 2,
      totalBalance: 175,
    });
  });
});

describe("segmentFilterSpec / passesSegmentFilter (Phase 12)", () => {
  it("recognizes individual as a distinct segment, not a fallback to all", () => {
    assert.equal(segmentFilterSpec("individual"), "individual");
    assert.equal(segmentFilterSpec("sme"), "sme");
    assert.equal(segmentFilterSpec("bogus"), "all");
  });

  it("passesSegmentFilter matches individual rows only under the individual spec", () => {
    assert.equal(passesSegmentFilter("individual", "individual"), true);
    assert.equal(passesSegmentFilter("seafarer", "individual"), false);
    assert.equal(passesSegmentFilter("individual", "all"), true);
  });
});
