import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cigRecentMatchesFinding,
  cigRecentMatchesSearch,
  cigRecentMatchesStatus,
} from "../history";

describe("cigRecentMatchesSearch", () => {
  it("matches name, email, and app no", () => {
    const item = {
      applicationNo: "APP-100",
      borrower: {
        borrowerNo: "BN1",
        firstName: "Rovick",
        lastName: "Romasanta",
        email: "rovick@example.com",
      },
    };
    assert.equal(cigRecentMatchesSearch(item, "rovick"), true);
    assert.equal(cigRecentMatchesSearch(item, "APP-100"), true);
    assert.equal(cigRecentMatchesSearch(item, "zzz"), false);
  });
});

describe("cigRecentMatchesFinding", () => {
  it("filters by finding", () => {
    assert.equal(cigRecentMatchesFinding("positive", "all"), true);
    assert.equal(cigRecentMatchesFinding("positive", "positive"), true);
    assert.equal(cigRecentMatchesFinding("negative", "positive"), false);
  });
});

describe("cigRecentMatchesStatus", () => {
  it("filters by status", () => {
    assert.equal(cigRecentMatchesStatus("for_approval", "all"), true);
    assert.equal(cigRecentMatchesStatus("for_approval", "for_approval"), true);
    assert.equal(cigRecentMatchesStatus("denied", "for_approval"), false);
  });
});
