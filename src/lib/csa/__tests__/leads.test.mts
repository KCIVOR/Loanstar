import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isOpenUnlinkedLead,
  parseBorrowerNameParts,
} from "../leads";

describe("isOpenUnlinkedLead (Phase 6)", () => {
  it("includes only open leads without an application", () => {
    assert.equal(
      isOpenUnlinkedLead({ applicationId: null, status: "open" }),
      true,
    );
  });

  it("excludes converted or linked leads", () => {
    assert.equal(
      isOpenUnlinkedLead({ applicationId: "app-1", status: "open" }),
      false,
    );
    assert.equal(
      isOpenUnlinkedLead({ applicationId: null, status: "converted" }),
      false,
    );
  });
});

describe("parseBorrowerNameParts (Phase 6)", () => {
  it("splits a simple first/last name for CSA prefill", () => {
    assert.deepEqual(parseBorrowerNameParts("Ana Santos"), {
      firstName: "Ana",
      lastName: "Santos",
    });
  });

  it("keeps multi-word last names", () => {
    assert.deepEqual(parseBorrowerNameParts("Juan dela Cruz"), {
      firstName: "Juan",
      lastName: "dela Cruz",
    });
  });

  it("handles a single token", () => {
    assert.deepEqual(parseBorrowerNameParts("Borrower"), {
      firstName: "Borrower",
      lastName: "",
    });
  });
});
