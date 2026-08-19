import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { emptyEvidence, type TurnEvidence } from "../card/evidence";
import { MAX_BLOCKS, MAX_TABLE_ROWS } from "../card/schema";
import { cardToText, validateAnswerCard } from "../card/validate";

function evidence(): TurnEvidence {
  const base = emptyEvidence();
  base.metrics["money.collected"] = {
    id: "money.collected",
    label: "Posted collections",
    unit: "php",
    value: 3_827_214,
    prior: 673_000,
    deltaPct: 468.7,
    direction: "up_good",
  };
  base.trends["delinquency.par30"] = {
    id: "delinquency.par30",
    label: "PAR 30",
    unit: "percent",
    points: [
      { label: "Jun", value: 2.1 },
      { label: "Jul", value: 2.4 },
    ],
    coverageNote: null,
  };
  base.trends["approvals.rate"] = {
    id: "approvals.rate",
    label: "Approval rate",
    unit: "percent",
    points: [
      { label: "Jun", value: null },
      { label: "Jul", value: null },
    ],
    coverageNote: "No committee decisions recorded.",
  };
  base.tables.pastDue = {
    id: "pastDue",
    label: "Past due",
    columns: [
      { key: "loanAccountNo", label: "Account", align: "left" },
      { key: "outstanding", label: "Outstanding", align: "right", unit: "php" },
    ],
    rows: Array.from({ length: 12 }, (_, i) => ({
      loanAccountNo: `L-${i}`,
      outstanding: 1000 * i,
    })),
    total: 40,
  };
  return base;
}

function block(overrides: Record<string, unknown>) {
  return {
    kind: "bullets",
    metricIds: [],
    trendId: "",
    tableId: "",
    limit: 0,
    items: [],
    text: "",
    ...overrides,
  };
}

describe("validateAnswerCard", () => {
  it("narrows a grounded card into renderable blocks", () => {
    const { card, dropped } = validateAnswerCard(
      {
        headline: "Collections came in well ahead of what was due.",
        bottomLine: "No action needed.",
        blocks: [
          block({ kind: "kpi", metricIds: ["money.collected"] }),
          block({ kind: "chart", trendId: "delinquency.par30" }),
          block({ kind: "table", tableId: "pastDue", limit: 3 }),
        ],
      },
      evidence(),
    );

    assert.equal(dropped, 0);
    assert.deepEqual(card?.blocks, [
      { kind: "kpi", metricIds: ["money.collected"] },
      { kind: "chart", trendId: "delinquency.par30" },
      { kind: "table", tableId: "pastDue", limit: 3 },
    ]);
  });

  it("drops citations to figures that were never looked up", () => {
    const { card, dropped } = validateAnswerCard(
      {
        headline: "PAR is climbing.",
        bottomLine: "Watch it.",
        blocks: [
          block({ kind: "kpi", metricIds: ["risk.par90", "money.collected"] }),
          block({ kind: "table", tableId: "borrowersWhoOweUs", limit: 5 }),
        ],
      },
      evidence(),
    );

    // The invented metric is stripped, the real one survives, and a table that
    // does not exist takes the whole block with it.
    assert.deepEqual(card?.blocks, [{ kind: "kpi", metricIds: ["money.collected"] }]);
    assert.equal(dropped, 1);
  });

  it("refuses a chart with no values behind it", () => {
    const { card } = validateAnswerCard(
      {
        headline: "Approvals held steady.",
        bottomLine: "Nothing to do.",
        blocks: [block({ kind: "chart", trendId: "approvals.rate" })],
      },
      evidence(),
    );
    assert.equal(card, null);
  });

  it("clamps the row limit to the cap and to what exists", () => {
    const { card } = validateAnswerCard(
      {
        headline: "The largest past-due accounts.",
        bottomLine: "Chase the top three.",
        blocks: [block({ kind: "table", tableId: "pastDue", limit: 999 })],
      },
      evidence(),
    );
    assert.deepEqual(card?.blocks, [
      { kind: "table", tableId: "pastDue", limit: MAX_TABLE_ROWS },
    ]);
  });

  it("falls back to a sane default when the limit is missing or zero", () => {
    const { card } = validateAnswerCard(
      {
        headline: "The largest past-due accounts.",
        bottomLine: "Chase them.",
        blocks: [block({ kind: "table", tableId: "pastDue", limit: 0 })],
      },
      evidence(),
    );
    assert.equal((card?.blocks[0] as { limit: number }).limit, 5);
  });

  it("keeps one copy of a repeated table and caps total blocks", () => {
    const { card } = validateAnswerCard(
      {
        headline: "Past due, twice over.",
        bottomLine: "Once is enough.",
        blocks: [
          block({ kind: "table", tableId: "pastDue", limit: 3 }),
          block({ kind: "table", tableId: "pastDue", limit: 4 }),
          block({ kind: "bullets", items: ["a"] }),
          block({ kind: "bullets", items: ["b"] }),
          block({ kind: "bullets", items: ["c"] }),
          block({ kind: "note", text: "d" }),
        ],
      },
      evidence(),
    );
    assert.equal(card?.blocks.length, MAX_BLOCKS);
    assert.equal(card?.blocks.filter((b) => b.kind === "table").length, 1);
  });

  it("returns null when nothing grounded survives, so the caller uses prose", () => {
    const { card } = validateAnswerCard(
      {
        headline: "Collection efficiency is the share of what was due that came in.",
        bottomLine: "",
        blocks: [block({ kind: "kpi", metricIds: ["money.invented"] })],
      },
      evidence(),
    );
    assert.equal(card, null);
  });

  it("returns null for a card with no headline", () => {
    const { card } = validateAnswerCard(
      {
        headline: "   ",
        bottomLine: "Something.",
        blocks: [block({ kind: "kpi", metricIds: ["money.collected"] })],
      },
      evidence(),
    );
    assert.equal(card, null);
  });

  it("survives junk without throwing", () => {
    assert.deepEqual(validateAnswerCard(null, evidence()), { card: null, dropped: 0 });
    assert.deepEqual(validateAnswerCard("nope", evidence()), { card: null, dropped: 0 });
    assert.equal(validateAnswerCard({ headline: "x", blocks: "no" }, evidence()).card, null);
  });
});

describe("cardToText", () => {
  it("keeps prose and names lists without inventing their figures", () => {
    const text = cardToText(
      {
        headline: "Collections ran ahead of schedule.",
        blocks: [
          { kind: "kpi", metricIds: ["money.collected"] },
          { kind: "bullets", items: ["Most receipts landed before the due date."] },
          { kind: "table", tableId: "pastDue", limit: 3 },
          { kind: "note", text: "Showing the largest only." },
        ],
        bottomLine: "Nothing to act on.",
      },
      evidence(),
    );

    assert.match(text, /^Collections ran ahead of schedule\./);
    assert.match(text, /- Most receipts landed before the due date\./);
    assert.match(text, /- Past due: 40 row\(s\)/);
    assert.match(text, /Showing the largest only\./);
    assert.match(text, /Nothing to act on\.$/);
  });
});
