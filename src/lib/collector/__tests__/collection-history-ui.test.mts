import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  COLLECTION_HISTORY_PAGE_SIZES,
  clampCollectionHistoryPageSize,
  computeDcrHistoryKpis,
  computePaymentHistoryKpis,
  isInCollectionHistoryRange,
  sortCollectionHistoryRows,
} from "../collection-history-ui";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..", "..");

describe("collection history UI helpers", () => {
  it("uses the standard history page sizes", () => {
    assert.deepEqual([...COLLECTION_HISTORY_PAGE_SIZES], [10, 20, 30, 50, 100]);
    assert.equal(clampCollectionHistoryPageSize(20), 20);
    assert.equal(clampCollectionHistoryPageSize(25), 10);
  });

  it("counts DCRR KPIs without treating drafts as submitted", () => {
    assert.deepEqual(
      computeDcrHistoryKpis([
        { status: "draft" },
        { status: "submitted" },
        { status: "submitted" },
        { status: "reconciled" },
        { status: "rejected" },
      ]),
      { submitted: 2, reconciled: 1, rejected: 1 },
    );
  });

  it("counts payment KPIs by workflow status", () => {
    assert.deepEqual(
      computePaymentHistoryKpis([
        { status: "pending_verification" },
        { status: "confirmed" },
        { status: "confirmed" },
        { status: "posted" },
        { status: "rejected" },
      ]),
      { pending: 1, confirmed: 2, posted: 1, rejected: 1 },
    );
  });

  it("applies the recent 30-day range deterministically", () => {
    const now = new Date("2026-08-17T12:00:00Z").getTime();
    assert.equal(
      isInCollectionHistoryRange("2026-08-01T00:00:00Z", "recent", now),
      true,
    );
    assert.equal(
      isInCollectionHistoryRange("2026-06-01T00:00:00Z", "recent", now),
      false,
    );
    assert.equal(
      isInCollectionHistoryRange("2026-06-01T00:00:00Z", "all", now),
      true,
    );
  });

  it("sorts a copy by date without mutating source rows", () => {
    const rows = [
      { id: "old", created_at: "2026-08-01T00:00:00Z" },
      { id: "new", created_at: "2026-08-10T00:00:00Z" },
    ];
    const sorted = sortCollectionHistoryRows(
      rows,
      (row) => row.created_at,
      "desc",
    );
    assert.deepEqual(
      sorted.map((row) => row.id),
      ["new", "old"],
    );
    assert.deepEqual(
      rows.map((row) => row.id),
      ["old", "new"],
    );
  });
});

describe("collector history unified page", () => {
  const page = readFileSync(
    join(src, "app", "collector", "history", "page.tsx"),
    "utf8",
  );

  it("uses the shared history chrome", () => {
    assert.match(page, /CollectorKpi/);
    assert.match(page, /ViewModeToggle/);
    assert.match(page, /<Skeleton/);
    assert.match(page, /<Select/);
    assert.match(page, /className="kpi-grid/);
    assert.match(page, /className=\{cn\("filter-panel"/);
  });

  it("supports list, grid, compact, and standard pagination", () => {
    assert.match(page, /viewMode === "grid"/);
    assert.match(page, /viewMode === "compact"/);
    assert.match(page, /className="grid-view/);
    assert.match(page, /summary=\{`Showing \$\{summaryStart\}/);
    assert.match(page, /COLLECTION_HISTORY_PAGE_SIZES/);
  });

  it("keeps recorder attribution in the redesigned payment views", () => {
    assert.match(page, /Recorded by \{pay\.uploadedByName\}/);
  });
});
