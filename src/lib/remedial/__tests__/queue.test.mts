import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { severityRank, type RemedialSeverity } from "../desk";
import {
  REMEDIAL_QUEUE_PAGE_SIZES,
  clampRemedialQueuePageSize,
  computeRemedialQueueKpis,
  inTurnedOverBounds,
  passesSegmentFilter,
  passesSeverity,
  remedialSearchPredicate,
  sanitizeSearchTerm,
  segmentFilterSpec,
  severityFilterSpec,
  sortRemedialQueue,
  type RemedialQueueMappedRow,
} from "../queue";

function row(
  overrides: Partial<RemedialQueueMappedRow> & {
    id: string;
    borrowerName?: string;
    severity?: RemedialSeverity;
    outstandingBalance?: number;
  },
): RemedialQueueMappedRow {
  return {
    id: overrides.id,
    borrowerName: overrides.borrowerName ?? "Borrower",
    borrowerNo: overrides.borrowerNo ?? "B-001",
    loanAccountNo: overrides.loanAccountNo ?? "LA-001",
    segment: overrides.segment ?? "seafarer",
    manningAgency: overrides.manningAgency ?? null,
    vesselName: overrides.vesselName ?? null,
    outstandingBalance: overrides.outstandingBalance ?? 0,
    agingBucket: overrides.agingBucket ?? "current",
    accountStatus: overrides.accountStatus ?? "active",
    monthlyAmortization: overrides.monthlyAmortization ?? 0,
    daysPastDue: overrides.daysPastDue ?? 0,
    severity: overrides.severity ?? "watch",
    nextDueDate: overrides.nextDueDate ?? null,
    nextDueAmount: overrides.nextDueAmount ?? null,
    turnedOverAt: overrides.turnedOverAt ?? null,
    turnoverReason: overrides.turnoverReason ?? "aging_91_plus",
    fromCollectorName: overrides.fromCollectorName ?? null,
  };
}

describe("REMEDIAL_QUEUE_PAGE_SIZES", () => {
  it("exposes the allowlisted page sizes used by the queue route", () => {
    assert.deepEqual([...REMEDIAL_QUEUE_PAGE_SIZES], [10, 20, 30, 50, 100]);
  });
});

describe("clampRemedialQueuePageSize", () => {
  it("passes through every allowlisted page size", () => {
    for (const size of REMEDIAL_QUEUE_PAGE_SIZES) {
      assert.equal(clampRemedialQueuePageSize(size), size, String(size));
    }
  });

  it("falls back to 10 for invalid page sizes", () => {
    assert.equal(clampRemedialQueuePageSize(0), 10);
    assert.equal(clampRemedialQueuePageSize(15), 10);
    assert.equal(clampRemedialQueuePageSize(NaN), 10);
    assert.equal(clampRemedialQueuePageSize(25), 10);
  });
});

describe("severityFilterSpec", () => {
  it("maps severity filters to the membership spec", () => {
    assert.deepEqual(severityFilterSpec("all"), { mode: "all" });
    assert.deepEqual(severityFilterSpec(""), { mode: "all" });
    assert.deepEqual(severityFilterSpec("critical"), {
      mode: "eq",
      severity: "critical",
    });
    assert.deepEqual(severityFilterSpec("elevated"), {
      mode: "eq",
      severity: "elevated",
    });
    assert.deepEqual(severityFilterSpec("watch"), {
      mode: "eq",
      severity: "watch",
    });
  });

  it("maps every /remedial Severity chip id the page exposes", () => {
    // Mirrors chips in src/app/remedial/page.tsx.
    const pageSeverityChips = ["all", "critical", "elevated", "watch"] as const;
    for (const id of pageSeverityChips) {
      if (id === "all") {
        assert.deepEqual(severityFilterSpec(id), { mode: "all" });
      } else {
        assert.deepEqual(severityFilterSpec(id), {
          mode: "eq",
          severity: id,
        });
      }
    }
  });

  it("falls back to all for unknown values", () => {
    assert.deepEqual(severityFilterSpec("unknown"), { mode: "all" });
    assert.deepEqual(severityFilterSpec("urgent"), { mode: "all" });
  });
});

describe("passesSeverity ↔ severityFilterSpec", () => {
  const severities: RemedialSeverity[] = ["critical", "elevated", "watch"];

  it("lets every severity through when spec is all", () => {
    for (const severity of severities) {
      assert.equal(
        passesSeverity(severity, severityFilterSpec("all")),
        true,
        severity,
      );
    }
  });

  it("matches only the requested severity", () => {
    for (const severity of severities) {
      for (const chip of severities) {
        assert.equal(
          passesSeverity(severity, severityFilterSpec(chip)),
          severity === chip,
          `${severity} vs ${chip}`,
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

describe("remedialSearchPredicate", () => {
  const sample = row({
    id: "1",
    borrowerName: "Juan Cruz",
    borrowerNo: "B-100",
    loanAccountNo: "LA-999",
    manningAgency: "Ocean Manning",
    vesselName: "MV Horizon",
  });

  it("matches empty / whitespace / sanitized-empty terms", () => {
    assert.equal(remedialSearchPredicate(sample, ""), true);
    assert.equal(remedialSearchPredicate(sample, "   "), true);
    assert.equal(remedialSearchPredicate(sample, "%%%"), true);
  });

  it("matches borrower name, borrower no, and account no", () => {
    assert.equal(remedialSearchPredicate(sample, "juan"), true);
    assert.equal(remedialSearchPredicate(sample, "B-100"), true);
    assert.equal(remedialSearchPredicate(sample, "LA-999"), true);
    assert.equal(remedialSearchPredicate(sample, "nope"), false);
  });

  it("matches secondary identity (manning agency / vessel)", () => {
    assert.equal(remedialSearchPredicate(sample, "ocean"), true);
    assert.equal(remedialSearchPredicate(sample, "horizon"), true);
    assert.equal(remedialSearchPredicate(sample, "manning · mv"), true);
  });

  it("sanitizes the term before matching", () => {
    assert.equal(remedialSearchPredicate(sample, "Juan%Cruz"), true);
    assert.equal(remedialSearchPredicate(sample, "(B-100)"), true);
    assert.equal(remedialSearchPredicate(sample, "Ocean,(Manning)"), true);
  });
});

describe("sortRemedialQueue", () => {
  const rows: RemedialQueueMappedRow[] = [
    row({
      id: "watch-low",
      borrowerName: "Zed",
      severity: "watch",
      outstandingBalance: 100,
      daysPastDue: 5,
      turnedOverAt: "2026-08-03T00:00:00.000Z",
    }),
    row({
      id: "critical-high",
      borrowerName: "Ann",
      severity: "critical",
      outstandingBalance: 900,
      daysPastDue: 40,
      turnedOverAt: "2026-08-01T00:00:00.000Z",
    }),
    row({
      id: "critical-low",
      borrowerName: "Mia",
      severity: "critical",
      outstandingBalance: 200,
      daysPastDue: 10,
      turnedOverAt: null,
    }),
    row({
      id: "elevated",
      borrowerName: "Ben",
      severity: "elevated",
      outstandingBalance: 500,
      daysPastDue: 20,
      turnedOverAt: "2026-08-02T00:00:00.000Z",
    }),
  ];

  it("sorts priority by severityRank then outstanding balance desc", () => {
    const sorted = sortRemedialQueue(rows, "priority", "asc");
    assert.deepEqual(
      sorted.map((r) => r.id),
      ["critical-high", "critical-low", "elevated", "watch-low"],
    );
  });

  it("does not reverse priority order when sortDir is desc", () => {
    const asc = sortRemedialQueue(rows, "priority", "asc").map((r) => r.id);
    const desc = sortRemedialQueue(rows, "priority", "desc").map((r) => r.id);
    assert.deepEqual(desc, asc);
  });

  it("sorts balance by outstandingBalance with sortDir", () => {
    assert.deepEqual(
      sortRemedialQueue(rows, "balance", "asc").map((r) => r.id),
      ["watch-low", "critical-low", "elevated", "critical-high"],
    );
    assert.deepEqual(
      sortRemedialQueue(rows, "balance", "desc").map((r) => r.id),
      ["critical-high", "elevated", "critical-low", "watch-low"],
    );
  });

  it("sorts dpd by daysPastDue with sortDir", () => {
    assert.deepEqual(
      sortRemedialQueue(rows, "dpd", "asc").map((r) => r.id),
      ["watch-low", "critical-low", "elevated", "critical-high"],
    );
    assert.deepEqual(
      sortRemedialQueue(rows, "dpd", "desc").map((r) => r.id),
      ["critical-high", "elevated", "critical-low", "watch-low"],
    );
  });

  it("sorts borrower by name with sortDir", () => {
    assert.deepEqual(
      sortRemedialQueue(rows, "borrower", "asc").map((r) => r.id),
      ["critical-high", "elevated", "critical-low", "watch-low"],
    );
    assert.deepEqual(
      sortRemedialQueue(rows, "borrower", "desc").map((r) => r.id),
      ["watch-low", "critical-low", "elevated", "critical-high"],
    );
  });

  it("sorts turned by turnedOverAt, treating null as empty", () => {
    assert.deepEqual(
      sortRemedialQueue(rows, "turned", "asc").map((r) => r.id),
      ["critical-low", "critical-high", "elevated", "watch-low"],
    );
    assert.deepEqual(
      sortRemedialQueue(rows, "turned", "desc").map((r) => r.id),
      ["watch-low", "elevated", "critical-high", "critical-low"],
    );
  });
});

describe("sort/severity use desk.ts severityRank", () => {
  it("does not reimplement rank — feeds the shared severityRank helper", () => {
    assert.ok(severityRank("critical") < severityRank("elevated"));
    assert.ok(severityRank("elevated") < severityRank("watch"));

    const mixed = [
      row({ id: "w", severity: "watch", outstandingBalance: 999 }),
      row({ id: "c", severity: "critical", outstandingBalance: 1 }),
      row({ id: "e", severity: "elevated", outstandingBalance: 50 }),
    ];
    const byRank = [...mixed].sort(
      (a, b) => severityRank(a.severity) - severityRank(b.severity),
    );
    const viaHelper = sortRemedialQueue(mixed, "priority", "asc");
    assert.deepEqual(
      viaHelper.map((r) => r.id),
      byRank.map((r) => r.id),
    );
    assert.deepEqual(
      viaHelper.map((r) => r.id),
      ["c", "e", "w"],
    );
  });
});

describe("computeRemedialQueueKpis", () => {
  it("returns zeros for an empty set", () => {
    assert.deepEqual(computeRemedialQueueKpis([]), {
      assigned: 0,
      critical: 0,
      avgDpd: 0,
      outstanding: 0,
    });
  });

  it("counts assigned/critical, averages dpd, and sums outstanding", () => {
    const kpis = computeRemedialQueueKpis([
      row({
        id: "a",
        severity: "critical",
        daysPastDue: 10,
        outstandingBalance: 100,
      }),
      row({
        id: "b",
        severity: "watch",
        daysPastDue: 20,
        outstandingBalance: 50,
      }),
      row({
        id: "c",
        severity: "critical",
        daysPastDue: 30,
        outstandingBalance: 25,
      }),
    ]);
    assert.deepEqual(kpis, {
      assigned: 3,
      critical: 2,
      avgDpd: 20,
      outstanding: 175,
    });
  });

  it("rounds average dpd", () => {
    const kpis = computeRemedialQueueKpis([
      row({ id: "a", daysPastDue: 1, outstandingBalance: 0 }),
      row({ id: "b", daysPastDue: 2, outstandingBalance: 0 }),
    ]);
    assert.equal(kpis.avgDpd, 2);
  });
});

describe("inTurnedOverBounds", () => {
  it("passes all rows when both bounds are null", () => {
    assert.equal(inTurnedOverBounds(null, null, null), true);
    assert.equal(
      inTurnedOverBounds("2026-08-01T12:00:00.000Z", null, null),
      true,
    );
  });

  it("excludes null timestamps once a bound is set", () => {
    assert.equal(inTurnedOverBounds(null, "2026-08-01", null), false);
    assert.equal(inTurnedOverBounds(null, null, "2026-08-31"), false);
  });

  it("applies inclusive date bounds against the timestamp", () => {
    assert.equal(
      inTurnedOverBounds("2026-08-01T00:00:00", "2026-08-01", "2026-08-01"),
      true,
    );
    assert.equal(
      inTurnedOverBounds("2026-07-31T23:59:59", "2026-08-01", null),
      false,
    );
    assert.equal(
      inTurnedOverBounds("2026-08-02T00:00:00", null, "2026-08-01"),
      false,
    );
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
