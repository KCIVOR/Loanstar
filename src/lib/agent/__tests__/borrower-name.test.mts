import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatBorrowerDisplayName } from "../borrower-name";

describe("formatBorrowerDisplayName", () => {
  it("renders Last, First Middle and skips empty middle/suffix", () => {
    assert.equal(
      formatBorrowerDisplayName({
        firstName: "Juan",
        middleName: "Dela",
        lastName: "Cruz",
        suffix: null,
      }),
      "Cruz, Juan Dela",
    );
    assert.equal(
      formatBorrowerDisplayName({
        firstName: "Ana",
        middleName: "",
        lastName: "Santos",
        suffix: "Jr",
      }),
      "Santos Jr, Ana",
    );
  });
});
