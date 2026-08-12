import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PROOF_LIST_PAGE_SIZES,
  PROOF_STATUS_FILTERS,
  clampProofListPageSize,
  computeProofListKpis,
  passesProofStatusFilter,
  proofSearchPredicate,
  proofStatusFilterSpec,
  sortProofsByDate,
  type ProofQueueItem,
  type ProofStatusFilter,
} from "../proofs";

function item(
  overrides: Partial<ProofQueueItem> & Pick<ProofQueueItem, "id" | "payment_date">,
): ProofQueueItem {
  return {
    id: overrides.id,
    reference_no: overrides.reference_no ?? "REF-100",
    payment_date: overrides.payment_date,
    amount: overrides.amount ?? 1000,
    status: overrides.status ?? "pending_verification",
    storage_path: overrides.storage_path ?? null,
    file_name: overrides.file_name ?? null,
    masterlist:
      overrides.masterlist === undefined
        ? { borrower_name: "Rovick Romasanta", loan_account_no: "LA-001" }
        : overrides.masterlist,
  };
}

describe("PROOF_LIST_PAGE_SIZES", () => {
  it("exposes the allowlisted page sizes used by the proofs list", () => {
    assert.deepEqual([...PROOF_LIST_PAGE_SIZES], [10, 20, 30, 50, 100]);
  });
});

describe("clampProofListPageSize", () => {
  it("accepts every allowlisted page size", () => {
    for (const size of PROOF_LIST_PAGE_SIZES) {
      assert.equal(clampProofListPageSize(size), size, String(size));
    }
  });

  it("falls back to 10 for invalid values", () => {
    assert.equal(clampProofListPageSize(0), 10);
    assert.equal(clampProofListPageSize(15), 10);
    assert.equal(clampProofListPageSize(NaN), 10);
    assert.equal(clampProofListPageSize(25), 10);
    assert.equal(clampProofListPageSize(-1), 10);
  });
});

describe("proofStatusFilterSpec", () => {
  it("maps every Status chip id the page exposes", () => {
    const pageStatusChips = ["all", "pending_verification", "confirmed"] as const;
    assert.deepEqual([...PROOF_STATUS_FILTERS], [...pageStatusChips]);
    for (const id of pageStatusChips) {
      assert.equal(proofStatusFilterSpec(id), id);
    }
  });

  it("falls back to all for unknown values", () => {
    assert.equal(proofStatusFilterSpec(""), "all");
    assert.equal(proofStatusFilterSpec("unknown"), "all");
    assert.equal(proofStatusFilterSpec("rejected"), "all");
    assert.equal(proofStatusFilterSpec("posted"), "all");
  });
});

describe("passesProofStatusFilter ↔ proofStatusFilterSpec", () => {
  const chips: Exclude<ProofStatusFilter, "all">[] = [
    "pending_verification",
    "confirmed",
  ];
  const statuses = ["pending_verification", "confirmed", "rejected", "posted"];

  it("lets every status through when spec is all", () => {
    for (const status of statuses) {
      assert.equal(
        passesProofStatusFilter(status, proofStatusFilterSpec("all")),
        true,
        status,
      );
    }
  });

  it("matches only the requested status chip", () => {
    for (const status of statuses) {
      for (const chip of chips) {
        assert.equal(
          passesProofStatusFilter(status, proofStatusFilterSpec(chip)),
          status === chip,
          `${status} vs ${chip}`,
        );
      }
    }
  });
});

describe("proofSearchPredicate", () => {
  const base = item({
    id: "pay-1",
    payment_date: "2026-08-01T00:00:00.000Z",
  });

  it("empty / whitespace term matches all", () => {
    assert.equal(proofSearchPredicate(base, ""), true);
    assert.equal(proofSearchPredicate(base, "   "), true);
  });

  it("matches reference_no case-insensitively", () => {
    assert.equal(proofSearchPredicate(base, "ref-100"), true);
    assert.equal(proofSearchPredicate(base, "REF-100"), true);
  });

  it("matches borrower name case-insensitively", () => {
    assert.equal(proofSearchPredicate(base, "rovick"), true);
    assert.equal(proofSearchPredicate(base, "ROMASANTA"), true);
    assert.equal(
      proofSearchPredicate(
        { reference_no: null, borrower_name: "Ana Cruz", loan_account_no: null },
        "ana",
      ),
      true,
    );
    assert.equal(
      proofSearchPredicate(
        { reference_no: null, borrower_name: "Ana Cruz", loan_account_no: null },
        "CRUZ",
      ),
      true,
    );
  });

  it("matches loan account no case-insensitively", () => {
    assert.equal(proofSearchPredicate(base, "la-001"), true);
    assert.equal(proofSearchPredicate(base, "LA-001"), true);
    assert.equal(
      proofSearchPredicate(
        {
          reference_no: null,
          borrower_name: null,
          loan_account_no: "ACC-999",
        },
        "acc-999",
      ),
      true,
    );
    assert.equal(
      proofSearchPredicate(
        {
          reference_no: null,
          borrower_name: null,
          loan_account_no: "ACC-999",
        },
        "ACC-999",
      ),
      true,
    );
  });

  it("rejects non-matches", () => {
    assert.equal(proofSearchPredicate(base, "zzz"), false);
    assert.equal(proofSearchPredicate(base, "REF-999"), false);
  });
});

describe("sortProofsByDate", () => {
  const early = item({
    id: "early",
    payment_date: "2026-08-01T10:00:00.000Z",
  });
  const mid = item({
    id: "mid",
    payment_date: "2026-08-02T10:00:00.000Z",
  });
  const late = item({
    id: "late",
    payment_date: "2026-08-03T10:00:00.000Z",
  });

  it("sorts ascending by payment_date", () => {
    const sorted = sortProofsByDate([late, early, mid], "asc");
    assert.deepEqual(
      sorted.map((r) => r.id),
      ["early", "mid", "late"],
    );
  });

  it("sorts descending by payment_date", () => {
    const sorted = sortProofsByDate([early, late, mid], "desc");
    assert.deepEqual(
      sorted.map((r) => r.id),
      ["late", "mid", "early"],
    );
  });

  it("does not mutate the input array", () => {
    const rows = [late, early];
    const copy = [...rows];
    sortProofsByDate(rows, "asc");
    assert.deepEqual(rows, copy);
  });
});

describe("computeProofListKpis", () => {
  it("returns zeros for an empty set", () => {
    assert.deepEqual(computeProofListKpis([]), {
      pendingReview: 0,
      confirmedAwaitingDcr: 0,
    });
  });

  it("counts mixed pending and confirmed; ignores other statuses", () => {
    assert.deepEqual(
      computeProofListKpis([
        { status: "pending_verification" },
        { status: "confirmed" },
        { status: "pending_verification" },
        { status: "rejected" },
        { status: "confirmed" },
        { status: "posted" },
        { status: "pending_verification" },
      ]),
      { pendingReview: 3, confirmedAwaitingDcr: 2 },
    );
  });
});
