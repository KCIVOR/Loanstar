import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cigMatchesWorkFilter, type CigWorkFilter } from "../desk";
import {
  CIG_QUEUE_PAGE_SIZES,
  CIG_WORK_FILTERS,
  cigQueueSearchPredicate,
  clampCigQueuePageSize,
  computeCigQueueKpis,
  inEndorsedAtBounds,
  passesWorkFilter,
  sortCigQueue,
  workFilterSpec,
  type CigQueueItem,
} from "../queue";

function row(
  overrides: Partial<CigQueueItem> & { id: string },
): CigQueueItem {
  return {
    id: overrides.id,
    applicationNo: overrides.applicationNo ?? "APP-001",
    status: overrides.status ?? "for_verification",
    endorsedAt: overrides.endorsedAt ?? null,
    createdAt: overrides.createdAt ?? "2026-08-01T00:00:00.000Z",
    borrower:
      overrides.borrower === undefined
        ? {
            borrowerNo: "B-001",
            firstName: "Borrower",
            lastName: "Name",
            email: "borrower@example.com",
          }
        : overrides.borrower,
    isRevision: overrides.isRevision ?? false,
    callbackOverdueAt: overrides.callbackOverdueAt ?? null,
  };
}

describe("CIG_QUEUE_PAGE_SIZES", () => {
  it("exposes the allowlisted page sizes used by the queue route", () => {
    assert.deepEqual([...CIG_QUEUE_PAGE_SIZES], [10, 20, 30, 50, 100]);
  });
});

describe("clampCigQueuePageSize", () => {
  it("passes through every allowlisted page size", () => {
    for (const size of CIG_QUEUE_PAGE_SIZES) {
      assert.equal(clampCigQueuePageSize(size), size, String(size));
    }
  });

  it("falls back to 10 for invalid page sizes", () => {
    assert.equal(clampCigQueuePageSize(0), 10);
    assert.equal(clampCigQueuePageSize(15), 10);
    assert.equal(clampCigQueuePageSize(NaN), 10);
    assert.equal(clampCigQueuePageSize(25), 10);
    assert.equal(clampCigQueuePageSize(-1), 10);
  });
});

describe("workFilterSpec", () => {
  it("maps every /cig WORK_CHIPS id the page exposes", () => {
    // Mirrors WORK_CHIPS in src/app/cig/page.tsx.
    const pageWorkChips = [
      "all",
      "revisions",
      "callback_overdue",
      "endorsed_today",
    ] as const;
    assert.deepEqual([...CIG_WORK_FILTERS], [...pageWorkChips]);
    for (const id of pageWorkChips) {
      assert.equal(workFilterSpec(id), id);
    }
  });

  it("falls back to all for unknown / empty values", () => {
    assert.equal(workFilterSpec(""), "all");
    assert.equal(workFilterSpec("unknown"), "all");
    assert.equal(workFilterSpec("overdue"), "all");
  });
});

describe("passesWorkFilter ↔ cigMatchesWorkFilter", () => {
  const asOf = new Date(2026, 7, 12, 12, 0, 0);
  const todayIso = new Date(2026, 7, 12, 9, 0, 0).toISOString();
  const yesterdayIso = new Date(2026, 7, 11, 9, 0, 0).toISOString();

  const fixtures = [
    row({
      id: "plain",
      isRevision: false,
      callbackOverdueAt: null,
      endorsedAt: yesterdayIso,
    }),
    row({
      id: "revision",
      isRevision: true,
      callbackOverdueAt: null,
      endorsedAt: yesterdayIso,
    }),
    row({
      id: "overdue",
      isRevision: false,
      callbackOverdueAt: "2026-08-11T00:00:00.000Z",
      endorsedAt: yesterdayIso,
    }),
    row({
      id: "today",
      isRevision: false,
      callbackOverdueAt: null,
      endorsedAt: todayIso,
    }),
  ];

  const filters: CigWorkFilter[] = [
    "all",
    "revisions",
    "callback_overdue",
    "endorsed_today",
  ];

  it("agrees with desk cigMatchesWorkFilter on the same fixtures", () => {
    for (const filter of filters) {
      for (const fixture of fixtures) {
        const viaQueue = passesWorkFilter(fixture, filter, asOf);
        const viaDesk = cigMatchesWorkFilter(fixture, filter, asOf);
        assert.equal(
          viaQueue,
          viaDesk,
          `${fixture.id} vs ${filter}`,
        );
      }
    }
  });
});

describe("cigQueueSearchPredicate", () => {
  const sample = row({
    id: "1",
    applicationNo: "APP-999",
    borrower: {
      borrowerNo: "B-100",
      firstName: "Juan",
      lastName: "Cruz",
      email: "juan.cruz@example.com",
    },
  });

  it("matches empty / whitespace / sanitized-empty terms", () => {
    assert.equal(cigQueueSearchPredicate(sample, ""), true);
    assert.equal(cigQueueSearchPredicate(sample, "   "), true);
    assert.equal(cigQueueSearchPredicate(sample, "%%%"), true);
  });

  it("matches borrower name, borrower no, email, and application no", () => {
    assert.equal(cigQueueSearchPredicate(sample, "juan"), true);
    assert.equal(cigQueueSearchPredicate(sample, "B-100"), true);
    assert.equal(cigQueueSearchPredicate(sample, "juan.cruz@"), true);
    assert.equal(cigQueueSearchPredicate(sample, "APP-999"), true);
    assert.equal(cigQueueSearchPredicate(sample, "nope"), false);
  });

  it("sanitizes the term before matching", () => {
    assert.equal(cigQueueSearchPredicate(sample, "Juan%Cruz"), true);
    assert.equal(cigQueueSearchPredicate(sample, "(B-100)"), true);
    assert.equal(cigQueueSearchPredicate(sample, "(APP-999)"), true);
  });

  it("handles null borrower / applicationNo without throwing", () => {
    const bare = row({
      id: "bare",
      applicationNo: null,
      borrower: null,
    });
    assert.equal(cigQueueSearchPredicate(bare, ""), true);
    assert.equal(cigQueueSearchPredicate(bare, "juan"), false);
  });
});

describe("inEndorsedAtBounds", () => {
  it("passes all rows when both bounds are null", () => {
    assert.equal(inEndorsedAtBounds(null, null, null), true);
    assert.equal(
      inEndorsedAtBounds("2026-08-01T12:00:00.000Z", null, null),
      true,
    );
  });

  it("excludes null endorsedAt once a bound is set", () => {
    assert.equal(inEndorsedAtBounds(null, "2026-08-01", null), false);
    assert.equal(inEndorsedAtBounds(null, null, "2026-08-31"), false);
  });

  it("applies inclusive date bounds against the timestamp", () => {
    assert.equal(
      inEndorsedAtBounds("2026-08-01T00:00:00", "2026-08-01", "2026-08-01"),
      true,
    );
    assert.equal(
      inEndorsedAtBounds("2026-07-31T23:59:59", "2026-08-01", null),
      false,
    );
    assert.equal(
      inEndorsedAtBounds("2026-08-02T00:00:00", null, "2026-08-01"),
      false,
    );
  });
});

describe("sortCigQueue", () => {
  const asOf = new Date("2026-08-12T12:00:00.000Z");

  const rows: CigQueueItem[] = [
    row({
      id: "attn-late",
      status: "for_revision",
      isRevision: true,
      endorsedAt: "2026-08-03T00:00:00.000Z",
    }),
    row({
      id: "attn-early",
      status: "for_verification",
      callbackOverdueAt: "2026-08-11T00:00:00.000Z",
      endorsedAt: "2026-08-01T00:00:00.000Z",
    }),
    row({
      id: "ok-mid",
      status: "for_verification",
      endorsedAt: "2026-08-02T00:00:00.000Z",
    }),
    row({
      id: "ok-null",
      status: "for_verification",
      endorsedAt: null,
    }),
    row({
      id: "ok-late",
      status: "submitted",
      endorsedAt: "2026-08-04T00:00:00.000Z",
    }),
  ];

  it("sorts priority by needs-attention first, then endorsedAt asc", () => {
    const sorted = sortCigQueue(rows, "priority", "asc", asOf);
    assert.deepEqual(
      sorted.map((r) => r.id),
      ["attn-early", "attn-late", "ok-null", "ok-mid", "ok-late"],
    );
  });

  it("does not reverse priority order when sortDir is desc", () => {
    const asc = sortCigQueue(rows, "priority", "asc", asOf).map((r) => r.id);
    const desc = sortCigQueue(rows, "priority", "desc", asOf).map((r) => r.id);
    assert.deepEqual(desc, asc);
  });

  it("sorts endorsed by endorsedAt with sortDir", () => {
    assert.deepEqual(
      sortCigQueue(rows, "endorsed", "asc", asOf).map((r) => r.id),
      ["ok-null", "attn-early", "ok-mid", "attn-late", "ok-late"],
    );
    assert.deepEqual(
      sortCigQueue(rows, "endorsed", "desc", asOf).map((r) => r.id),
      ["ok-late", "attn-late", "ok-mid", "attn-early", "ok-null"],
    );
  });

  it("sorts waiting by daysSince(endorsedAt), treating null as -1", () => {
    assert.deepEqual(
      sortCigQueue(rows, "waiting", "asc", asOf).map((r) => r.id),
      ["ok-null", "ok-late", "attn-late", "ok-mid", "attn-early"],
    );
    assert.deepEqual(
      sortCigQueue(rows, "waiting", "desc", asOf).map((r) => r.id),
      ["attn-early", "ok-mid", "attn-late", "ok-late", "ok-null"],
    );
  });

  it("sorts status by localeCompare with sortDir", () => {
    assert.deepEqual(
      sortCigQueue(rows, "status", "asc", asOf).map((r) => r.id),
      ["attn-late", "attn-early", "ok-mid", "ok-null", "ok-late"],
    );
    assert.deepEqual(
      sortCigQueue(rows, "status", "desc", asOf).map((r) => r.id),
      ["ok-late", "attn-early", "ok-mid", "ok-null", "attn-late"],
    );
  });
});

describe("computeCigQueueKpis", () => {
  const asOf = new Date(2026, 7, 12, 12, 0, 0);
  const todayIso = new Date(2026, 7, 12, 9, 0, 0).toISOString();
  const yesterdayIso = new Date(2026, 7, 11, 9, 0, 0).toISOString();

  it("returns zeros for an empty set", () => {
    assert.deepEqual(computeCigQueueKpis([], asOf), {
      inQueue: 0,
      revisions: 0,
      callbackOverdue: 0,
      endorsedToday: 0,
      needsAttention: 0,
    });
  });

  it("counts inQueue / revisions / callbackOverdue / endorsedToday / needsAttention", () => {
    const kpis = computeCigQueueKpis(
      [
        row({
          id: "rev",
          isRevision: true,
          callbackOverdueAt: null,
          endorsedAt: yesterdayIso,
        }),
        row({
          id: "overdue",
          isRevision: false,
          callbackOverdueAt: "2026-08-11T00:00:00.000Z",
          endorsedAt: yesterdayIso,
        }),
        row({
          id: "today",
          isRevision: false,
          callbackOverdueAt: null,
          endorsedAt: todayIso,
        }),
        row({
          id: "plain",
          isRevision: false,
          callbackOverdueAt: null,
          endorsedAt: yesterdayIso,
        }),
        row({
          id: "both",
          isRevision: true,
          callbackOverdueAt: "2026-08-10T00:00:00.000Z",
          endorsedAt: todayIso,
        }),
      ],
      asOf,
    );
    assert.deepEqual(kpis, {
      inQueue: 5,
      revisions: 2,
      callbackOverdue: 2,
      endorsedToday: 2,
      needsAttention: 3,
    });
  });
});
