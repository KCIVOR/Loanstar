import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildClaimProfilePatch,
  classifyBorrowerForRegistration,
  normalizeBorrowerEmail,
} from "../claim";

describe("normalizeBorrowerEmail (Phase 5)", () => {
  it("trims and lowercases", () => {
    assert.equal(normalizeBorrowerEmail("  Ana@Example.COM "), "ana@example.com");
  });
});

describe("classifyBorrowerForRegistration (Phase 5)", () => {
  it("returns new when no row", () => {
    assert.equal(classifyBorrowerForRegistration(null), "new");
  });

  it("returns claimable only for unclaimed rows (user_id null)", () => {
    assert.equal(
      classifyBorrowerForRegistration({
        id: "b1",
        user_id: null,
        email: "x@y.com",
        first_name: "Ana",
        middle_name: null,
        last_name: "Santos",
        mobile_phone: null,
      }),
      "claimable",
    );
  });

  it("returns already_claimed when user_id is set", () => {
    assert.equal(
      classifyBorrowerForRegistration({
        id: "b1",
        user_id: "user-1",
        email: "x@y.com",
        first_name: "Ana",
        middle_name: null,
        last_name: "Santos",
        mobile_phone: null,
      }),
      "already_claimed",
    );
  });
});

describe("buildClaimProfilePatch (Phase 5)", () => {
  it("always sets user_id and fills only null/empty profile fields", () => {
    const patch = buildClaimProfilePatch(
      {
        id: "b1",
        user_id: null,
        email: "x@y.com",
        first_name: "Ana",
        middle_name: null,
        last_name: "Santos",
        mobile_phone: null,
        suffix: null,
        date_of_birth: null,
        place_of_birth: null,
        citizenship: "Filipino",
        civil_status: null,
        gender: null,
        landline: null,
      },
      {
        userId: "user-new",
        firstName: "Different",
        middleName: "M",
        lastName: "Name",
        mobilePhone: "09171234567",
        suffix: "Jr",
        dateOfBirth: "1990-01-01",
        placeOfBirth: "Manila",
        citizenship: "Filipino",
        civilStatus: "Single",
        gender: "F",
        landline: "123",
      },
    );

    assert.equal(patch.user_id, "user-new");
    // CSA already set names — do not overwrite
    assert.equal(patch.first_name, undefined);
    assert.equal(patch.last_name, undefined);
    // Null fields get form values
    assert.equal(patch.middle_name, "M");
    assert.equal(patch.mobile_phone, "09171234567");
    assert.equal(patch.suffix, "Jr");
    assert.equal(patch.date_of_birth, "1990-01-01");
    assert.equal(patch.civil_status, "Single");
  });

  it("does not fill from blank form values", () => {
    const patch = buildClaimProfilePatch(
      {
        id: "b1",
        user_id: null,
        email: "x@y.com",
        first_name: "Ana",
        middle_name: null,
        last_name: "Santos",
        mobile_phone: null,
      },
      {
        userId: "user-new",
        firstName: "Ana",
        lastName: "Santos",
        mobilePhone: "",
      },
    );
    assert.equal(patch.mobile_phone, undefined);
  });
});
