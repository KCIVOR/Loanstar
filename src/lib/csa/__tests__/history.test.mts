import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { APPLICATION_STATUSES } from "../../constants";
import {
  IN_PROGRESS_STATUSES,
  RELEASED_STATUSES,
  csaHistoryMatchesSearch,
  csaHistoryStatusGroup,
  pickLatestActiveComputation,
  statusesForHistoryGroup,
  type CsaHistoryStatusGroup,
} from "../history";

/** Statuses reachable after CSA endorsement (see history plan Phase 0 / Phase 2). */
const POST_ENDORSEMENT_GROUPS: Record<string, CsaHistoryStatusGroup> = {
  for_verification: "in_progress",
  for_approval: "in_progress",
  committee_hold: "in_progress",
  approved: "in_progress",
  for_revision: "in_progress",
  negotiating_terms: "in_progress",
  awaiting_confirmation: "in_progress",
  lra_pending: "in_progress",
  release_signing: "in_progress",
  release_briefing: "in_progress",
  release_ready: "in_progress",
  denied: "denied",
  cancelled: "denied",
  released: "released",
  closed: "released",
  loan_active: "released",
  paid_off: "released",
};

describe("csaHistoryStatusGroup", () => {
  it("buckets every post-endorsement APPLICATION_STATUSES value", () => {
    const postEndorsement = APPLICATION_STATUSES.filter(
      (status) => status in POST_ENDORSEMENT_GROUPS,
    );
    assert.ok(postEndorsement.length >= 16);
    for (const status of postEndorsement) {
      assert.equal(
        csaHistoryStatusGroup(status),
        POST_ENDORSEMENT_GROUPS[status],
        status,
      );
    }
  });

  it("defaults unknown/future statuses to in_progress", () => {
    assert.equal(csaHistoryStatusGroup("weird_future_status"), "in_progress");
  });
});

describe("IN_PROGRESS_STATUSES / RELEASED_STATUSES", () => {
  it("agree with csaHistoryStatusGroup for every listed status", () => {
    for (const status of IN_PROGRESS_STATUSES) {
      assert.equal(csaHistoryStatusGroup(status), "in_progress", status);
    }
    for (const status of RELEASED_STATUSES) {
      assert.equal(csaHistoryStatusGroup(status), "released", status);
    }
    assert.equal(csaHistoryStatusGroup("denied"), "denied");
    assert.equal(csaHistoryStatusGroup("cancelled"), "denied");
  });

  it("cover every post-endorsement in_progress and released status", () => {
    const expectedInProgress = Object.entries(POST_ENDORSEMENT_GROUPS)
      .filter(([, group]) => group === "in_progress")
      .map(([status]) => status)
      .sort();
    const expectedReleased = Object.entries(POST_ENDORSEMENT_GROUPS)
      .filter(([, group]) => group === "released")
      .map(([status]) => status)
      .sort();
    assert.deepEqual([...IN_PROGRESS_STATUSES].sort(), expectedInProgress);
    assert.deepEqual([...RELEASED_STATUSES].sort(), expectedReleased);
  });
});

describe("statusesForHistoryGroup", () => {
  it("maps statusGroup to the .in() status list used by the query builder", () => {
    assert.equal(statusesForHistoryGroup("all"), null);
    assert.deepEqual(statusesForHistoryGroup("denied"), ["denied", "cancelled"]);
    assert.equal(statusesForHistoryGroup("released"), RELEASED_STATUSES);
    assert.equal(statusesForHistoryGroup("in_progress"), IN_PROGRESS_STATUSES);
  });
});

describe("csaHistoryMatchesSearch", () => {
  const item = {
    applicationNo: "APP-100",
    borrower: {
      borrowerNo: "BN1",
      firstName: "Rovick",
      lastName: "Romasanta",
      email: "rovick@example.com",
    },
  };

  it("matches name, borrower no, email, and application no (case-insensitive)", () => {
    assert.equal(csaHistoryMatchesSearch(item, "rovick"), true);
    assert.equal(csaHistoryMatchesSearch(item, "ROMASANTA"), true);
    assert.equal(csaHistoryMatchesSearch(item, "bn1"), true);
    assert.equal(csaHistoryMatchesSearch(item, "EXAMPLE.COM"), true);
    assert.equal(csaHistoryMatchesSearch(item, "app-100"), true);
    assert.equal(csaHistoryMatchesSearch(item, "zzz"), false);
  });

  it("empty term matches all", () => {
    assert.equal(csaHistoryMatchesSearch(item, ""), true);
    assert.equal(csaHistoryMatchesSearch(item, "   "), true);
  });

  it("handles null borrower and application no", () => {
    assert.equal(
      csaHistoryMatchesSearch({ applicationNo: null, borrower: null }, "x"),
      false,
    );
    assert.equal(
      csaHistoryMatchesSearch({ applicationNo: null, borrower: null }, ""),
      true,
    );
  });
});

describe("pickLatestActiveComputation", () => {
  it("prefers the highest version for the given application", () => {
    const rows = [
      {
        loan_application_id: "a",
        loan_type_name: "Seafarer",
        principal: 100,
        version: 1,
      },
      {
        loan_application_id: "a",
        loan_type_name: "Seafarer Plus",
        principal: 200,
        version: 3,
      },
      {
        loan_application_id: "b",
        loan_type_name: "Other",
        principal: 999,
        version: 9,
      },
    ];
    assert.deepEqual(pickLatestActiveComputation(rows, "a"), {
      loanTypeName: "Seafarer Plus",
      principal: 200,
    });
  });

  it("returns null when no rows match the application", () => {
    assert.equal(
      pickLatestActiveComputation(
        [
          {
            loan_application_id: "b",
            loan_type_name: "Other",
            principal: 1,
            version: 1,
          },
        ],
        "a",
      ),
      null,
    );
  });
});
