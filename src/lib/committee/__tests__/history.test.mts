import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COMMITTEE_DECISION_ACTIONS,
  actionFilterSpec,
  myVoteFromSnapshot,
  pickLatestActiveComputation,
} from "../history";

describe("myVoteFromSnapshot", () => {
  const snapshot = [
    { voterId: "u1", vote: "approve" as const },
    { voterId: "u2", vote: "deny" as const },
  ];

  it("returns the matching user's vote", () => {
    assert.equal(myVoteFromSnapshot(snapshot, "u1"), "approve");
    assert.equal(myVoteFromSnapshot(snapshot, "u2"), "deny");
  });

  it("returns null when the user is not in the snapshot", () => {
    assert.equal(myVoteFromSnapshot(snapshot, "u-missing"), null);
  });

  it("returns null for empty or missing snapshots", () => {
    assert.equal(myVoteFromSnapshot([], "u1"), null);
    assert.equal(myVoteFromSnapshot(null, "u1"), null);
    assert.equal(myVoteFromSnapshot(undefined, "u1"), null);
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

describe("actionFilterSpec", () => {
  it("maps action filter to the .eq() value used by the query builder", () => {
    assert.equal(actionFilterSpec("all"), null);
    for (const action of COMMITTEE_DECISION_ACTIONS) {
      assert.equal(actionFilterSpec(action), action, action);
    }
  });
});
