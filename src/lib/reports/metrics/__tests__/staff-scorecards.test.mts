import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildAgentScorecard,
  buildCigScorecard,
  buildLraScorecard,
  buildRemedialScorecard,
  withinPeriod,
} from "../staff-scorecards";

const NAMES = new Map([
  ["u-1", "Ana Reyes"],
  ["u-2", "Ben Cruz"],
]);
const PERIOD = { from: "2026-08-01", to: "2026-08-31" };

describe("withinPeriod", () => {
  it("passes everything through when no period is given", () => {
    assert.equal(withinPeriod("2020-01-01T00:00:00.000Z", undefined), true);
    assert.equal(withinPeriod(null, undefined), true);
  });

  it("includes both boundary days", () => {
    assert.equal(withinPeriod("2026-08-01T00:00:00.000Z", PERIOD), true);
    assert.equal(withinPeriod("2026-08-31T23:59:59.000Z", PERIOD), true);
  });

  it("excludes outside days and null timestamps", () => {
    assert.equal(withinPeriod("2026-07-31T23:00:00.000Z", PERIOD), false);
    assert.equal(withinPeriod("2026-09-01T00:00:00.000Z", PERIOD), false);
    assert.equal(withinPeriod(null, PERIOD), false);
  });
});

describe("buildAgentScorecard", () => {
  const statuses = new Map([
    ["app-released", "loan_active"],
    ["app-pending", "for_approval"],
    ["app-denied", "denied"],
  ]);

  it("counts a lead as converted only once its application is released", () => {
    const rows = buildAgentScorecard(
      [
        { agent_user_id: "u-1", application_id: "app-released", created_at: "2026-08-05T00:00:00.000Z" },
        { agent_user_id: "u-1", application_id: "app-pending", created_at: "2026-08-06T00:00:00.000Z" },
        { agent_user_id: "u-1", application_id: "app-denied", created_at: "2026-08-07T00:00:00.000Z" },
        { agent_user_id: "u-1", application_id: null, created_at: "2026-08-08T00:00:00.000Z" },
      ],
      statuses,
      NAMES,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.name, "Ana Reyes");
    assert.equal(rows[0]!.leadsCreated, 4);
    assert.equal(rows[0]!.leadsConverted, 1);
    assert.equal(rows[0]!.conversionRatePct, 25);
  });

  it("scopes to the period when one is given", () => {
    const leads = [
      { agent_user_id: "u-1", application_id: "app-released", created_at: "2026-07-05T00:00:00.000Z" },
      { agent_user_id: "u-1", application_id: "app-pending", created_at: "2026-08-05T00:00:00.000Z" },
    ];
    assert.equal(buildAgentScorecard(leads, statuses, NAMES).length, 1);
    assert.equal(buildAgentScorecard(leads, statuses, NAMES)[0]!.leadsCreated, 2);
    assert.equal(buildAgentScorecard(leads, statuses, NAMES, PERIOD)[0]!.leadsCreated, 1);
  });

  it("ignores leads with no agent", () => {
    const rows = buildAgentScorecard(
      [{ agent_user_id: null, application_id: null, created_at: "2026-08-05T00:00:00.000Z" }],
      statuses,
      NAMES,
    );
    assert.deepEqual(rows, []);
  });

  it("leaves the rate null rather than dividing by zero", () => {
    assert.deepEqual(buildAgentScorecard([], statuses, NAMES), []);
  });
});

describe("buildCigScorecard", () => {
  it("counts completed verifications and averages how long they took", () => {
    const rows = buildCigScorecard(
      [
        {
          completed_by: "u-1",
          is_complete: true,
          created_at: "2026-08-01T00:00:00.000Z",
          completed_at: "2026-08-05T00:00:00.000Z",
        },
        {
          completed_by: "u-1",
          is_complete: true,
          created_at: "2026-08-10T00:00:00.000Z",
          completed_at: "2026-08-12T00:00:00.000Z",
        },
        {
          completed_by: "u-1",
          is_complete: false,
          created_at: "2026-08-15T00:00:00.000Z",
          completed_at: null,
        },
      ],
      [],
      NAMES,
    );
    assert.equal(rows[0]!.verificationsCompleted, 2);
    assert.equal(rows[0]!.avgDaysToComplete, 3);
  });

  it("computes a pass rate from recorded checks", () => {
    const rows = buildCigScorecard(
      [],
      [
        { checked_by: "u-1", result: "pass", checked_at: "2026-08-02T00:00:00.000Z" },
        { checked_by: "u-1", result: "pass", checked_at: "2026-08-03T00:00:00.000Z" },
        { checked_by: "u-1", result: "fail", checked_at: "2026-08-04T00:00:00.000Z" },
      ],
      NAMES,
    );
    assert.equal(rows[0]!.checksRecorded, 3);
    assert.equal(rows[0]!.checkPassRatePct, 66.7);
  });

  it("keeps the pass rate null when nobody recorded a check", () => {
    const rows = buildCigScorecard(
      [
        {
          completed_by: "u-1",
          is_complete: true,
          created_at: "2026-08-01T00:00:00.000Z",
          completed_at: "2026-08-02T00:00:00.000Z",
        },
      ],
      [],
      NAMES,
    );
    assert.equal(rows[0]!.checkPassRatePct, null);
  });
});

describe("buildLraScorecard", () => {
  const files = [
    {
      assigned_to: "u-1",
      status: "released",
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-04T00:00:00.000Z",
    },
    {
      assigned_to: "u-1",
      status: "awaiting_path",
      created_at: "2026-08-10T00:00:00.000Z",
      updated_at: "2026-08-10T00:00:00.000Z",
    },
    {
      assigned_to: "u-2",
      status: "closed",
      created_at: "2026-08-02T00:00:00.000Z",
      updated_at: "2026-08-03T00:00:00.000Z",
    },
  ];

  it("separates files handled from files actually released", () => {
    const rows = buildLraScorecard(files, NAMES);
    const ana = rows.find((r) => r.userId === "u-1")!;
    assert.equal(ana.filesAssigned, 2);
    assert.equal(ana.filesReleased, 1);
    assert.equal(ana.avgDaysToRelease, 3);
  });

  it("treats closed as released", () => {
    const ben = buildLraScorecard(files, NAMES).find((r) => r.userId === "u-2")!;
    assert.equal(ben.filesReleased, 1);
    assert.equal(ben.avgDaysToRelease, 1);
  });

  it("ranks by files released", () => {
    assert.equal(buildLraScorecard(files, NAMES)[0]!.userId, "u-1");
  });
});

describe("buildRemedialScorecard", () => {
  const assignments = [
    { masterlist_id: "ml-1", remedial_user_id: "u-1" },
    { masterlist_id: "ml-2", remedial_user_id: "u-1" },
    { masterlist_id: "ml-3", remedial_user_id: null },
  ];
  const turnovers = [
    { masterlist_id: "ml-1", to_remedial_user_id: "u-1", confirmed_at: "2026-08-05T00:00:00.000Z" },
  ];

  it("credits only cash posted after the account was turned over", () => {
    const rows = buildRemedialScorecard(
      assignments,
      turnovers,
      [
        { masterlist_id: "ml-1", amount: 5_000, posted_at: "2026-08-01T00:00:00.000Z" },
        { masterlist_id: "ml-1", amount: 3_000, posted_at: "2026-08-10T00:00:00.000Z" },
        { masterlist_id: "ml-1", amount: 2_000, posted_at: "2026-08-20T00:00:00.000Z" },
      ],
      NAMES,
    );
    assert.equal(rows[0]!.amountRecovered, 5_000);
  });

  it("counts accounts held and turnovers received separately", () => {
    const rows = buildRemedialScorecard(assignments, turnovers, [], NAMES);
    assert.equal(rows[0]!.accountsHeld, 2);
    assert.equal(rows[0]!.turnoversReceived, 1);
  });

  it("ignores postings on accounts that were never turned over", () => {
    const rows = buildRemedialScorecard(
      assignments,
      turnovers,
      [{ masterlist_id: "ml-2", amount: 9_000, posted_at: "2026-08-20T00:00:00.000Z" }],
      NAMES,
    );
    assert.equal(rows[0]!.amountRecovered, 0);
  });

  it("scopes recovery to the period when one is given", () => {
    const postings = [
      { masterlist_id: "ml-1", amount: 3_000, posted_at: "2026-08-10T00:00:00.000Z" },
      { masterlist_id: "ml-1", amount: 4_000, posted_at: "2026-09-10T00:00:00.000Z" },
    ];
    assert.equal(buildRemedialScorecard(assignments, turnovers, postings, NAMES)[0]!.amountRecovered, 7_000);
    assert.equal(
      buildRemedialScorecard(assignments, turnovers, postings, NAMES, PERIOD)[0]!.amountRecovered,
      3_000,
    );
  });
});
