import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatBorrowerDisplayName } from "../borrower-name";

describe("formatBorrowerDisplayName", () => {
  it("joins name parts and skips empty middle/suffix", () => {
    assert.equal(
      formatBorrowerDisplayName({
        firstName: "Juan",
        middleName: "Dela",
        lastName: "Cruz",
        suffix: null,
      }),
      "Juan Dela Cruz",
    );
    assert.equal(
      formatBorrowerDisplayName({
        firstName: "Ana",
        middleName: "",
        lastName: "Santos",
        suffix: "Jr",
      }),
      "Ana Santos Jr",
    );
  });
});
