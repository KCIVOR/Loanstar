import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  captureSkillResult,
  describeEvidence,
  emptyEvidence,
  isEvidenceEmpty,
  pruneEvidence,
} from "../card/evidence";
import type { AnswerCard } from "../card/schema";

function snapshotResult() {
  return {
    ok: true,
    name: "get_snapshot",
    data: {
      metrics: [
        {
          id: "money.collected",
          label: "Posted collections",
          unit: "php",
          direction: "up_good",
          value: 3_827_214,
          prior: 673_000,
          deltaAbs: 3_154_214,
          deltaPct: 468.7,
          significant: true,
        },
        {
          id: "money.collectionEfficiency",
          label: "Collection efficiency",
          unit: "percent",
          direction: "up_good",
          value: 233,
          prior: 100,
          deltaAbs: 133,
          deltaPct: 133,
          note: "above 100% because borrowers are paying ahead of schedule",
        },
      ],
      aging: {
        current: 12,
        bucket1_30: 4,
        bucket31_60: 2,
        bucket61_90: 0,
        bucket91_plus: 0,
        totalOutstanding: 12_400_000,
      },
      pipeline: { submitted: 9, for_approval: 15 },
      stuckFileCount: 16,
      stuckFiles: [
        { applicationNo: "APP-1", status: "submitted", daysInStatus: 12, targetDays: 3 },
      ],
    },
  };
}

describe("captureSkillResult", () => {
  it("indexes metrics with their label, unit and note", () => {
    const evidence = emptyEvidence();
    captureSkillResult(evidence, snapshotResult());

    const collected = evidence.metrics["money.collected"];
    assert.equal(collected?.label, "Posted collections");
    assert.equal(collected?.unit, "php");
    assert.equal(collected?.value, 3_827_214);
    assert.equal(collected?.deltaPct, 468.7);
    assert.equal(collected?.note, undefined);

    assert.match(
      String(evidence.metrics["money.collectionEfficiency"]?.note),
      /ahead of schedule/,
    );
  });

  it("turns the flat aging object into account-count rows", () => {
    // buildAgingReport counts accounts per bucket; only totalOutstanding is money.
    const evidence = emptyEvidence();
    captureSkillResult(evidence, snapshotResult());

    const aging = evidence.tables.aging;
    assert.equal(aging?.rows.length, 5);
    assert.deepEqual(aging?.rows[0], { bucket: "Current", accounts: 12 });
    assert.equal(aging?.columns.find((c) => c.key === "accounts")?.unit, "count");
  });

  it("sorts the pipeline map with the biggest queue first", () => {
    const evidence = emptyEvidence();
    captureSkillResult(evidence, snapshotResult());
    assert.deepEqual(evidence.tables.pipeline?.rows[0], {
      status: "for_approval",
      count: 15,
    });
  });

  it("keeps the true total so the card can say how many are hidden", () => {
    const evidence = emptyEvidence();
    captureSkillResult(evidence, snapshotResult());
    assert.equal(evidence.tables.stuckFiles?.total, 16);
    assert.equal(evidence.tables.stuckFiles?.rows.length, 1);
  });

  it("names the account column after whichever identifier survived redaction", () => {
    const redacted = emptyEvidence();
    captureSkillResult(redacted, {
      ok: true,
      name: "list_past_due",
      data: {
        kpis: { count: 3 },
        rows: [{ loanAccountNo: "L-1", outstanding: 50_000, daysLate: 45 }],
      },
    });
    assert.equal(redacted.tables.pastDue?.columns[0]?.key, "loanAccountNo");
    assert.equal(redacted.tables.pastDue?.columns[0]?.label, "Account");

    const named = emptyEvidence();
    captureSkillResult(named, {
      ok: true,
      name: "list_past_due",
      data: {
        kpis: { count: 3 },
        rows: [
          { borrowerName: "Ana Cruz", loanAccountNo: "L-1", outstanding: 50_000, daysLate: 45 },
        ],
      },
    });
    assert.equal(named.tables.pastDue?.columns[0]?.key, "borrowerName");
    assert.equal(named.tables.pastDue?.columns[0]?.label, "Borrower");
  });

  it("drops columns no row actually filled", () => {
    const evidence = emptyEvidence();
    captureSkillResult(evidence, {
      ok: true,
      name: "get_staff",
      data: { committeeParticipation: [{ name: "R. Diaz", votesCast: 4 }] },
    });
    assert.deepEqual(
      evidence.tables.committee?.columns.map((c) => c.key),
      ["name", "votesCast"],
    );
  });

  it("indexes each trend series under its own id with the coverage note", () => {
    const evidence = emptyEvidence();
    captureSkillResult(evidence, {
      ok: true,
      name: "get_trends",
      data: {
        series: "delinquency",
        months: 6,
        group: {
          id: "delinquency",
          label: "Delinquency",
          coverage: { note: "Only 3 months of history behind this." },
          series: [
            {
              id: "delinquency.par30",
              label: "PAR 30",
              unit: "percent",
              points: [
                { month: "2026-06", label: "Jun", value: 2.1 },
                { month: "2026-07", label: "Jul", value: null },
              ],
            },
          ],
        },
      },
    });

    const par30 = evidence.trends["delinquency.par30"];
    assert.equal(par30?.label, "PAR 30");
    assert.equal(par30?.points.length, 2);
    assert.equal(par30?.points[1]?.value, null);
    assert.match(String(par30?.coverageNote), /3 months/);
  });

  it("ignores failed skill results", () => {
    const evidence = emptyEvidence();
    captureSkillResult(evidence, { ok: false, name: "get_snapshot", error: "boom" });
    assert.equal(isEvidenceEmpty(evidence), true);
  });
});

describe("describeEvidence", () => {
  it("lists every citable key and surfaces notes", () => {
    const evidence = emptyEvidence();
    captureSkillResult(evidence, snapshotResult());
    const described = describeEvidence(evidence);

    assert.match(described, /money\.collected/);
    assert.match(described, /aging/);
    assert.match(described, /ahead of schedule/);
  });

  it("tells the model to answer in prose when nothing was looked up", () => {
    assert.match(describeEvidence(emptyEvidence()), /prose only/);
  });
});

describe("pruneEvidence", () => {
  it("keeps only what the card cites and trims rows to the limit", () => {
    const evidence = emptyEvidence();
    captureSkillResult(evidence, snapshotResult());

    const card: AnswerCard = {
      headline: "Collections are running ahead of schedule.",
      blocks: [
        { kind: "kpi", metricIds: ["money.collected"] },
        { kind: "table", tableId: "aging", limit: 2 },
      ],
      bottomLine: "Nothing to act on.",
    };

    const pruned = pruneEvidence(evidence, card);
    assert.deepEqual(Object.keys(pruned.metrics), ["money.collected"]);
    assert.deepEqual(Object.keys(pruned.tables), ["aging"]);
    assert.equal(pruned.tables.aging?.rows.length, 2);
    // The untouched total still reports the real size.
    assert.equal(pruned.tables.aging?.total, 5);
  });
});
