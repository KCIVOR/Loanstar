import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  AR_HISTORY_PAGE_SIZES,
  POSTING_AMOUNT_FETCH_PAGE,
  clampArHistoryPageSize,
  sumPostingAmounts,
} from "../history";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..", "..");

function source(...parts: string[]) {
  return readFileSync(join(src, ...parts), "utf8");
}

describe("AR_HISTORY_PAGE_SIZES / POSTING_AMOUNT_FETCH_PAGE", () => {
  it("exposes the allowlisted page sizes used by history routes", () => {
    assert.deepEqual([...AR_HISTORY_PAGE_SIZES], [10, 20, 30, 50, 100]);
  });

  it("uses 1000 as the PostgREST amount-fetch page size", () => {
    assert.equal(POSTING_AMOUNT_FETCH_PAGE, 1000);
  });
});

describe("clampArHistoryPageSize", () => {
  it("passes through every allowlisted page size", () => {
    for (const size of AR_HISTORY_PAGE_SIZES) {
      assert.equal(clampArHistoryPageSize(size), size, String(size));
    }
  });

  it("falls back to 10 for invalid page sizes", () => {
    assert.equal(clampArHistoryPageSize(0), 10);
    assert.equal(clampArHistoryPageSize(15), 10);
    assert.equal(clampArHistoryPageSize(25), 10);
    assert.equal(clampArHistoryPageSize(-1), 10);
    assert.equal(clampArHistoryPageSize(NaN), 10);
  });
});

describe("sumPostingAmounts", () => {
  it("sums numeric amounts", () => {
    assert.equal(
      sumPostingAmounts([{ amount: 100 }, { amount: 250.5 }, { amount: 49.5 }]),
      400,
    );
  });

  it("returns 0 for an empty list", () => {
    assert.equal(sumPostingAmounts([]), 0);
  });

  it("treats non-numeric amounts as 0", () => {
    const rows = [
      { amount: 10 },
      { amount: Number.NaN },
      { amount: "20" as unknown as number },
      { amount: null as unknown as number },
      { amount: undefined as unknown as number },
    ];
    assert.equal(sumPostingAmounts(rows), 30);
  });
});

describe("AR internal-transfer source-loan navigation", () => {
  it("keeps AR source-loan links inside the AR masterlist", () => {
    const historyPage = source("app", "ar", "history", "page.tsx");
    const transfersPage = source("app", "ar", "internal-transfers", "page.tsx");
    const history = source("lib", "ar", "history.ts");
    const transfers = source("lib", "ar", "internal-transfers.ts");

    assert.match(history, /sourceMasterlistId/);
    assert.match(transfers, /sourceMasterlistId/);

    for (const page of [historyPage, transfersPage]) {
      assert.match(page, /href=\{`\/ar\/masterlist\/\$\{row\.sourceMasterlistId\}`\}/);
      assert.doesNotMatch(page, /href=\{`\/lra\/applications\/\$\{row\.sourceLoanApplicationId\}`\}/);
    }
  });
});
