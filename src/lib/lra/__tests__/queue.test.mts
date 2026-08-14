import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isCompletedLraQueueItem } from "../queue-classify";
import {
  LRA_QUEUE_PAGE_SIZES,
  QUEUE_FETCH_PAGE,
  classifyQueueItem,
  clampLraQueuePageSize,
  matchesLraQueueSearch,
  passesScope,
  scopeFilterSpec,
  statusFilterSpec,
  type LraQueueItem,
} from "../queue";

/** Minimal queue row from a classify-input shape (same cases as queue-classify). */
function queueItem(overrides: {
  applicationStatus?: string | null;
  blocker?: string | null;
  releaseFileStatus?: string | null;
}): LraQueueItem {
  const applicationStatus = overrides.applicationStatus ?? "release_signing";
  const blocker =
    overrides.blocker !== undefined
      ? overrides.blocker
      : "Pending: release path selection";
  const releaseFileStatus =
    overrides.releaseFileStatus !== undefined
      ? overrides.releaseFileStatus
      : "awaiting_path";

  return {
    applicationId: "app-1",
    computationId: "comp-1",
    queuedAt: "2026-08-01T10:00:00.000Z",
    segment: null,
    application: {
      applicationNo: "APP-001",
      status: applicationStatus ?? "release_signing",
      blocker,
      updatedAt: "2026-08-01T10:00:00.000Z",
    },
    borrower: {
      borrowerNo: "B-001",
      firstName: "Juan",
      lastName: "Dela Cruz",
    },
    releaseFile: releaseFileStatus
      ? { status: releaseFileStatus, releasePaths: ["with_pdc"] }
      : null,
  };
}

/** Cases already covered in queue-classify.test.mts for completed / active. */
const CLASSIFY_SCOPE_CASES: Array<{
  label: string;
  item: LraQueueItem;
}> = [
  {
    label: "release file released",
    item: queueItem({ releaseFileStatus: "released" }),
  },
  {
    label: "release file closed",
    item: queueItem({ releaseFileStatus: "closed" }),
  },
  {
    label: "application paid_off",
    item: queueItem({
      applicationStatus: "paid_off",
      releaseFileStatus: null,
    }),
  },
  {
    label: "application closed",
    item: queueItem({
      applicationStatus: "closed",
      releaseFileStatus: null,
    }),
  },
  {
    label: "active awaiting_path",
    item: queueItem({}),
  },
];

describe("LRA_QUEUE_PAGE_SIZES / QUEUE_FETCH_PAGE", () => {
  it("exposes the allowlisted page sizes used by the queue route", () => {
    assert.deepEqual([...LRA_QUEUE_PAGE_SIZES], [10, 20, 30, 50, 100]);
  });

  it("uses 1000 as the PostgREST queue fetch page size", () => {
    assert.equal(QUEUE_FETCH_PAGE, 1000);
  });
});

describe("clampLraQueuePageSize", () => {
  it("passes through every allowlisted page size", () => {
    for (const size of LRA_QUEUE_PAGE_SIZES) {
      assert.equal(clampLraQueuePageSize(size), size, String(size));
    }
  });

  it("falls back to 10 for invalid page sizes", () => {
    assert.equal(clampLraQueuePageSize(0), 10);
    assert.equal(clampLraQueuePageSize(15), 10);
    assert.equal(clampLraQueuePageSize(NaN), 10);
  });
});

describe("scopeFilterSpec", () => {
  it("maps each LraQueueScope to a filter-spec mode", () => {
    assert.deepEqual(scopeFilterSpec("active"), { mode: "active" });
    assert.deepEqual(scopeFilterSpec("completed"), { mode: "completed" });
    assert.deepEqual(scopeFilterSpec("all"), { mode: "all" });
  });
});

describe("statusFilterSpec", () => {
  it("maps status filters to the eq value used after map", () => {
    assert.deepEqual(statusFilterSpec("all"), { mode: "all" });
    assert.deepEqual(statusFilterSpec(""), { mode: "all" });
    assert.deepEqual(statusFilterSpec("release_ready"), {
      mode: "eq",
      status: "release_ready",
    });
  });

  it("maps every /lra Status chip id the page exposes", () => {
    // Mirrors STATUS_CHIPS in src/app/lra/page.tsx.
    const pageStatusChips = [
      "all",
      "lra_pending",
      "release_signing",
      "release_briefing",
      "release_ready",
      "released",
      "closed",
      "paid_off",
    ] as const;
    for (const id of pageStatusChips) {
      if (id === "all") {
        assert.deepEqual(statusFilterSpec(id), { mode: "all" });
      } else {
        assert.deepEqual(statusFilterSpec(id), { mode: "eq", status: id });
      }
    }
  });
});

describe("passesScope ↔ isCompletedLraQueueItem agreement", () => {
  it("agrees for every case already covered in queue-classify.test.mts", () => {
    for (const { label, item } of CLASSIFY_SCOPE_CASES) {
      const completed = isCompletedLraQueueItem(classifyQueueItem(item));

      assert.equal(
        passesScope(item, scopeFilterSpec("all")),
        true,
        `${label}: all`,
      );
      assert.equal(
        passesScope(item, scopeFilterSpec("active")),
        !completed,
        `${label}: active`,
      );
      assert.equal(
        passesScope(item, scopeFilterSpec("completed")),
        completed,
        `${label}: completed`,
      );
    }
  });

  it("does not reimplement completion — classifyQueueItem feeds the shared helper", () => {
    const item = queueItem({ releaseFileStatus: "released" });
    assert.equal(
      isCompletedLraQueueItem(classifyQueueItem(item)),
      isCompletedLraQueueItem({
        applicationStatus: item.application?.status,
        blocker: item.application?.blocker,
        releaseFileStatus: item.releaseFile?.status,
      }),
    );
  });
});

describe("matchesLraQueueSearch", () => {
  const item = queueItem({});

  it("matches empty / whitespace terms", () => {
    assert.equal(matchesLraQueueSearch(item, ""), true);
    assert.equal(matchesLraQueueSearch(item, "   "), true);
  });

  it("matches borrower name, borrower no, and application no", () => {
    assert.equal(matchesLraQueueSearch(item, "juan"), true);
    assert.equal(matchesLraQueueSearch(item, "B-001"), true);
    assert.equal(matchesLraQueueSearch(item, "APP-001"), true);
    assert.equal(matchesLraQueueSearch(item, "nope"), false);
  });
});
