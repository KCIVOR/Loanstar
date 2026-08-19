import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { leadPipelineStage, type LeadPipelineStage } from "../pipeline";
import {
  AGENT_LEADS_QUEUE_PAGE_SIZES,
  QUEUE_FETCH_PAGE,
  clampAgentLeadsQueuePageSize,
  passesSegmentFilter,
  passesStage,
  stageFilterSpec,
  statusFilterSpec,
} from "../queue";

/** Cases already covered in pipeline.test.mts for leadPipelineStage. */
const PIPELINE_STAGE_CASES: Array<{
  label: string;
  applicationId: string | null;
  checklistPercent: number | null;
  expected: LeadPipelineStage;
}> = [
  {
    label: "unlinked",
    applicationId: null,
    checklistPercent: null,
    expected: "awaiting_link",
  },
  {
    label: "gathering",
    applicationId: "a",
    checklistPercent: 40,
    expected: "gathering_docs",
  },
  {
    label: "ready",
    applicationId: "a",
    checklistPercent: 100,
    expected: "docs_ready",
  },
];

describe("AGENT_LEADS_QUEUE_PAGE_SIZES / QUEUE_FETCH_PAGE", () => {
  it("exposes the allowlisted page sizes used by the queue route", () => {
    assert.deepEqual([...AGENT_LEADS_QUEUE_PAGE_SIZES], [10, 20, 30, 50, 100]);
  });

  it("uses 1000 as the PostgREST queue fetch page size", () => {
    assert.equal(QUEUE_FETCH_PAGE, 1000);
  });
});

describe("clampAgentLeadsQueuePageSize", () => {
  it("passes through every allowlisted page size", () => {
    for (const size of AGENT_LEADS_QUEUE_PAGE_SIZES) {
      assert.equal(clampAgentLeadsQueuePageSize(size), size, String(size));
    }
  });

  it("falls back to 10 for invalid page sizes", () => {
    assert.equal(clampAgentLeadsQueuePageSize(0), 10);
    assert.equal(clampAgentLeadsQueuePageSize(15), 10);
    assert.equal(clampAgentLeadsQueuePageSize(NaN), 10);
  });
});

describe("statusFilterSpec", () => {
  it("maps status filters to the SQL eq spec", () => {
    assert.deepEqual(statusFilterSpec("all"), { mode: "all" });
    assert.deepEqual(statusFilterSpec(""), { mode: "all" });
    assert.deepEqual(statusFilterSpec("open"), { mode: "eq", status: "open" });
    assert.deepEqual(statusFilterSpec("converted"), {
      mode: "eq",
      status: "converted",
    });
  });

  it("maps every /agent Status chip id the page exposes", () => {
    // Mirrors STATUS_CHIPS in src/app/agent/page.tsx.
    const pageStatusChips = ["all", "open", "converted"] as const;
    for (const id of pageStatusChips) {
      if (id === "all") {
        assert.deepEqual(statusFilterSpec(id), { mode: "all" });
      } else {
        assert.deepEqual(statusFilterSpec(id), { mode: "eq", status: id });
      }
    }
  });

  it("falls back to all for unknown values", () => {
    assert.deepEqual(statusFilterSpec("dropped"), { mode: "all" });
    assert.deepEqual(statusFilterSpec("lost"), { mode: "all" });
  });
});

describe("stageFilterSpec", () => {
  it("maps each pipeline stage filter to a membership spec", () => {
    assert.deepEqual(stageFilterSpec("all"), { mode: "all" });
    assert.deepEqual(stageFilterSpec(""), { mode: "all" });
    assert.deepEqual(stageFilterSpec("awaiting_link"), {
      mode: "eq",
      stage: "awaiting_link",
    });
    assert.deepEqual(stageFilterSpec("gathering_docs"), {
      mode: "eq",
      stage: "gathering_docs",
    });
    assert.deepEqual(stageFilterSpec("docs_ready"), {
      mode: "eq",
      stage: "docs_ready",
    });
  });

  it("maps every /agent Stage chip id the page exposes", () => {
    // Mirrors STAGE_CHIPS in src/app/agent/page.tsx.
    const pageStageChips = [
      "all",
      "awaiting_link",
      "gathering_docs",
      "docs_ready",
    ] as const;
    for (const id of pageStageChips) {
      if (id === "all") {
        assert.deepEqual(stageFilterSpec(id), { mode: "all" });
      } else {
        assert.deepEqual(stageFilterSpec(id), { mode: "eq", stage: id });
      }
    }
  });

  it("falls back to all for unknown values", () => {
    assert.deepEqual(stageFilterSpec("unknown"), { mode: "all" });
  });
});

describe("passesStage ↔ leadPipelineStage agreement", () => {
  it("agrees for every case already covered in pipeline.test.mts", () => {
    for (const {
      label,
      applicationId,
      checklistPercent,
      expected,
    } of PIPELINE_STAGE_CASES) {
      const stage = leadPipelineStage({ applicationId, checklistPercent });
      assert.equal(stage, expected, `${label}: classify`);

      assert.equal(
        passesStage(stage, stageFilterSpec("all")),
        true,
        `${label}: all`,
      );
      assert.equal(
        passesStage(stage, stageFilterSpec("awaiting_link")),
        stage === "awaiting_link",
        `${label}: awaiting_link`,
      );
      assert.equal(
        passesStage(stage, stageFilterSpec("gathering_docs")),
        stage === "gathering_docs",
        `${label}: gathering_docs`,
      );
      assert.equal(
        passesStage(stage, stageFilterSpec("docs_ready")),
        stage === "docs_ready",
        `${label}: docs_ready`,
      );
    }
  });

  it("does not reimplement stage — feeds the shared leadPipelineStage helper", () => {
    const input = { applicationId: "a" as string | null, checklistPercent: 100 };
    const viaHelper = leadPipelineStage(input);
    assert.equal(viaHelper, "docs_ready");
    assert.equal(
      passesStage(viaHelper, stageFilterSpec("docs_ready")),
      true,
    );
    assert.equal(
      passesStage(viaHelper, stageFilterSpec("gathering_docs")),
      false,
    );
  });
});

describe("passesSegmentFilter (Phase 12)", () => {
  it("matches individual leads only under the individual filter", () => {
    assert.equal(
      passesSegmentFilter({ segment: "individual" }, "individual"),
      true,
    );
    assert.equal(
      passesSegmentFilter({ segment: "seafarer" }, "individual"),
      false,
    );
    assert.equal(passesSegmentFilter({ segment: "individual" }, "all"), true);
    assert.equal(passesSegmentFilter({ segment: null }, "individual"), false);
  });
});
