import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { METRICS } from "../../metrics/registry";
import type { MetricValue } from "../../metrics/types";
import type { LoanRegisterRow, PastDueRow } from "../../registers";
import {
  ACTIVE_SKILL_NAMES,
  LIST_SKILL_LIMIT,
  buildListAccountsPayload,
  buildListPastDuePayload,
  buildListPipelinePayload,
  findMetricValue,
  matchesRegisterQuery,
  openaiToolDefs,
  redactLoanRow,
  redactStuckFile,
  runSkill,
} from "../skills";

const dummySupabase = {} as SupabaseClient;
const period = { from: "2026-08-01", to: "2026-08-19" };

describe("openaiToolDefs", () => {
  it("names equal ACTIVE_SKILL_NAMES", () => {
    const names = openaiToolDefs().map((t) => t.function.name);
    assert.deepEqual(names, [...ACTIVE_SKILL_NAMES]);
  });

  it("list_accounts and list_collections accept Individual", () => {
    const defs = openaiToolDefs();
    const accounts = defs.find((t) => t.function.name === "list_accounts")!;
    const collections = defs.find((t) => t.function.name === "list_collections")!;
    const accountsParams = accounts.function.parameters as {
      properties: Record<string, { enum?: string[] }>;
    };
    const collectionsParams = collections.function.parameters as {
      properties: Record<string, { enum?: string[] }>;
    };
    assert.deepEqual(accountsParams.properties.segment?.enum, [
      "all",
      "seafarer",
      "sme",
      "individual",
    ]);
    assert.deepEqual(collectionsParams.properties.segment?.enum, [
      "all",
      "seafarer",
      "sme",
      "individual",
    ]);
    assert.deepEqual(accountsParams.properties.collateral?.enum, [
      "all",
      "none",
      "car_refinancing",
      "real_estate",
    ]);
  });
});

describe("matchesRegisterQuery", () => {
  it("matches name fragments case-insensitively", () => {
    assert.equal(matchesRegisterQuery(["Rovick Romasanta", "LN-1"], "romasanta"), true);
    assert.equal(matchesRegisterQuery(["Rovick Romasanta", "LN-1"], "nope"), false);
  });
});

describe("findMetricValue", () => {
  const metrics: MetricValue[] = [
    {
      id: "money.collected",
      value: 100,
      prior: 80,
      deltaAbs: 20,
      deltaPct: 25,
    },
  ];

  it("finds money.collected", () => {
    assert.equal(findMetricValue(metrics, "money.collected")?.id, "money.collected");
  });

  it("returns undefined for money.nope", () => {
    assert.equal(findMetricValue(metrics, "money.nope"), undefined);
  });
});

describe("runSkill", () => {
  it("unknown skill name returns unknown_skill", async () => {
    const result = await runSkill("nope", "{}", {
      supabase: dummySupabase,
      period,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, "unknown_skill");
      assert.equal(result.name, "nope");
    }
  });

  it("get_catalog returns every METRICS id", async () => {
    const result = await runSkill("get_catalog", "{}", {
      supabase: dummySupabase,
      period,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const data = result.data as { definitions: Array<{ id: string }> };
    const ids = data.definitions.map((d) => d.id).sort();
    assert.deepEqual(ids, METRICS.map((m) => m.id).sort());
  });

  it("get_metric invalid JSON returns invalid_args", async () => {
    const result = await runSkill("get_metric", "{not json", {
      supabase: dummySupabase,
      period,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "invalid_args");
  });

  it("get_metric missing id returns invalid_args", async () => {
    const result = await runSkill("get_metric", "{}", {
      supabase: dummySupabase,
      period,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "invalid_args");
  });

  it("get_metric unknown id returns unknown_metric", async () => {
    const result = await runSkill("get_metric", JSON.stringify({ id: "money.nope" }), {
      supabase: dummySupabase,
      period,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "unknown_metric");
  });

  it("list_accounts invalid JSON returns invalid_args", async () => {
    const result = await runSkill("list_accounts", "{not json", {
      supabase: dummySupabase,
      period,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "invalid_args");
  });
});

function sampleLoan(overrides: Partial<LoanRegisterRow> = {}): LoanRegisterRow {
  return {
    masterlistId: "ml-1",
    loanAccountNo: "LN-1001",
    borrowerId: "b-1",
    borrowerName: "Jane Borrower",
    segment: "seafarer",
    collateralType: "none",
    accountStatus: "active",
    agingBucket: "31-60",
    outstanding: 50_000,
    totalLoan: 80_000,
    releaseDate: "2026-01-15",
    collectorName: "Cole",
    remedialName: null,
    ...overrides,
  };
}

describe("redactLoanRow", () => {
  it("keeps borrowerName and masterlistId when includeBorrowerNames is true", () => {
    const row = redactLoanRow(sampleLoan(), true);
    assert.equal(row.borrowerName, "Jane Borrower");
    assert.equal(row.masterlistId, "ml-1");
    assert.equal(row.loanAccountNo, "LN-1001");
  });

  it("omits borrowerName and masterlistId when includeBorrowerNames is false", () => {
    const row = redactLoanRow(sampleLoan(), false);
    assert.equal("borrowerName" in row, false);
    assert.equal("masterlistId" in row, false);
    assert.equal(row.loanAccountNo, "LN-1001");
    assert.equal(row.outstanding, 50_000);
  });
});

describe("redactStuckFile", () => {
  const file = {
    applicationId: "app-1",
    applicationNo: "APP-9",
    borrowerName: "Jane Borrower",
    status: "for_approval",
    daysInStatus: 12,
    targetDays: 5,
    segment: "seafarer" as const,
    collateralType: "none" as const,
  };

  it("never includes applicationId", () => {
    const withNames = redactStuckFile(file, true);
    const withoutNames = redactStuckFile(file, false);
    assert.equal("applicationId" in withNames, false);
    assert.equal("applicationId" in withoutNames, false);
    assert.equal(withNames.borrowerName, "Jane Borrower");
    assert.equal("borrowerName" in withoutNames, false);
  });
});

describe("buildListAccountsPayload", () => {
  it("defaults to unpaid loans and redacts names", () => {
    const payload = buildListAccountsPayload(
      [
        sampleLoan(),
        sampleLoan({
          masterlistId: "ml-paid",
          loanAccountNo: "LN-paid",
          accountStatus: "paid",
          outstanding: 0,
        }),
      ],
      { status: "unpaid", segment: "all", aging: "all", collateral: "all" },
      "loans",
      false,
    );
    assert.equal(payload.kpis.count, 1);
    assert.equal(payload.truncated, false);
    assert.equal(payload.rows.length, 1);
    assert.equal("borrowerName" in payload.rows[0]!, false);
    assert.equal(payload.rows[0]!.loanAccountNo, "LN-1001");
  });

  it("keeps the true total in kpis.count while sending only the largest rows", () => {
    const loans = Array.from({ length: LIST_SKILL_LIMIT + 3 }, (_, i) =>
      sampleLoan({
        masterlistId: `ml-${i}`,
        loanAccountNo: `LN-${i}`,
        outstanding: 1000 - i,
      }),
    );
    const payload = buildListAccountsPayload(
      loans,
      { status: "unpaid", segment: "all", aging: "all", collateral: "all" },
      "loans",
      true,
    );
    assert.equal(payload.kpis.count, LIST_SKILL_LIMIT + 3);
    assert.ok(payload.rows.length <= LIST_SKILL_LIMIT);
    assert.equal(payload.truncated, true);
    assert.equal(payload.shown, payload.rows.length);
    assert.equal(payload.shown + payload.omitted, LIST_SKILL_LIMIT + 3);
    assert.equal(payload.rows[0]!.borrowerName, "Jane Borrower");
  });

  it("trims rows to stay inside the character budget and says how many it dropped", () => {
    const loans = Array.from({ length: 40 }, (_, i) =>
      sampleLoan({
        masterlistId: `ml-${i}`,
        loanAccountNo: `LN-${i}`,
        outstanding: 1000 - i,
      }),
    );
    const payload = buildListAccountsPayload(
      loans,
      { status: "unpaid", segment: "all", aging: "all", collateral: "all" },
      "loans",
      true,
      "",
      1500,
    );

    // The whole result stays parseable — this is what the old mid-string
    // slice in the agent loop destroyed.
    const serialized = JSON.stringify(payload);
    assert.ok(serialized.length <= 1500, `payload was ${serialized.length} chars`);
    const reparsed = JSON.parse(serialized) as typeof payload;
    assert.equal(reparsed.rows.length, payload.rows.length);
    assert.equal(reparsed.omitted, payload.omitted);

    assert.ok(payload.rows.length > 0);
    assert.ok(payload.omitted > 0);
    assert.equal(payload.shown + payload.omitted, 40);
    assert.equal(payload.kpis.count, 40);
  });

  it("q matches borrower name across paid and unpaid when status is all", () => {
    const payload = buildListAccountsPayload(
      [
        sampleLoan({ borrowerName: "Rovick Romasanta", loanAccountNo: "LN-R1" }),
        sampleLoan({
          masterlistId: "ml-other",
          borrowerName: "Someone Else",
          loanAccountNo: "LN-X",
        }),
      ],
      { status: "all", segment: "all", aging: "all", collateral: "all" },
      "loans",
      true,
      "rovick",
    );
    assert.equal(payload.kpis.count, 1);
    assert.equal(payload.rows[0]!.loanAccountNo, "LN-R1");
  });
});

describe("buildListPastDuePayload", () => {
  it("includes daysLate and redacts names", () => {
    const row: PastDueRow = { ...sampleLoan(), daysLate: 44 };
    const payload = buildListPastDuePayload([row], "par30", false);
    assert.equal(payload.aging, "par30");
    assert.equal(payload.kpis.count, 1);
    assert.equal(payload.rows[0]!.daysLate, 44);
    assert.equal("borrowerName" in payload.rows[0]!, false);
  });
});

describe("buildListPipelinePayload", () => {
  it("strips applicationId even when names are included", () => {
    const payload = buildListPipelinePayload(
      period,
      [
        {
          id: "origination.approvalRate",
          value: 80,
          prior: 70,
          deltaAbs: 10,
          deltaPct: 14.3,
        },
      ],
      [
        {
          applicationId: "secret-id",
          applicationNo: "APP-1",
          borrowerName: "Jane Borrower",
          status: "for_approval",
          daysInStatus: 9,
          targetDays: 5,
          segment: "individual",
          collateralType: "car_refinancing",
        },
      ],
      true,
    );
    assert.equal(payload.stuckFiles[0]!.borrowerName, "Jane Borrower");
    assert.equal("applicationId" in payload.stuckFiles[0]!, false);
    assert.equal(payload.metrics[0]!.id, "origination.approvalRate");
  });
});
