import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CO_BORROWER_EDITABLE_STATUSES,
  assertCanEditCoBorrowers,
  assertCoBorrowerRequirementAllowed,
  coBorrowerBannerState,
  isCoBorrowerEditableStatus,
  normalizeCoBorrowers,
  type CoBorrower,
} from "../co-borrower";

const one: CoBorrower[] = [{ fullName: "Ana Reyes", address: "12 Mabini St" }];

describe("co-borrower — assertCoBorrowerRequirementAllowed (Phase 2)", () => {
  it("rejects seafarer", () => {
    const r = assertCoBorrowerRequirementAllowed("seafarer");
    assert.equal(r.ok, false);
    assert.match(
      (r as { ok: false; reason: string }).reason,
      /seafarer application/,
    );
  });

  it("allows sme / individual / unknown", () => {
    for (const seg of ["sme", "individual", null, "whatever"]) {
      assert.deepEqual(assertCoBorrowerRequirementAllowed(seg), { ok: true });
    }
  });
});

describe("co-borrower — assertCanEditCoBorrowers (Phase 4 route gate)", () => {
  it("rejects seafarer", () => {
    const r = assertCanEditCoBorrowers({
      segment: "seafarer",
      coBorrowerRequired: true,
      status: "approved",
    });
    assert.equal(r.ok, false);
  });

  it("rejects when the application does not require a co-borrower", () => {
    const r = assertCanEditCoBorrowers({
      segment: "sme",
      coBorrowerRequired: false,
      status: "approved",
    });
    assert.equal(r.ok, false);
    assert.match(
      (r as { ok: false; reason: string }).reason,
      /does not require a co-borrower/,
    );
  });

  it("rejects once the file is locked for release", () => {
    for (const status of ["lra_pending", "release_signing", "released", "closed"]) {
      const r = assertCanEditCoBorrowers({
        segment: "individual",
        coBorrowerRequired: true,
        status,
      });
      assert.equal(r.ok, false, `expected ${status} to be rejected`);
    }
  });

  it("allows every intake + pre-release status when required and non-seafarer", () => {
    for (const status of CO_BORROWER_EDITABLE_STATUSES) {
      assert.deepEqual(
        assertCanEditCoBorrowers({
          segment: "sme",
          coBorrowerRequired: true,
          status,
        }),
        { ok: true },
        `expected ${status} to be allowed`,
      );
    }
  });
});

describe("co-borrower — isCoBorrowerEditableStatus", () => {
  it("covers intake through negotiating_terms, excludes release+", () => {
    assert.equal(isCoBorrowerEditableStatus("for_revision"), true);
    assert.equal(isCoBorrowerEditableStatus("approved"), true);
    assert.equal(isCoBorrowerEditableStatus("awaiting_confirmation"), true);
    assert.equal(isCoBorrowerEditableStatus("negotiating_terms"), true);
    assert.equal(isCoBorrowerEditableStatus("lra_pending"), false);
    assert.equal(isCoBorrowerEditableStatus("released"), false);
    assert.equal(isCoBorrowerEditableStatus("for_verification"), false);
  });
});

describe("co-borrower — normalizeCoBorrowers", () => {
  it("keeps only rows with both name and address, trimmed", () => {
    assert.deepEqual(
      normalizeCoBorrowers([
        { fullName: "  A  ", address: "X" },
        { fullName: "", address: "Y" },
        { address: "Z" },
        { fullName: "B" },
        { fullName: "C", address: "   " },
        "nope",
        null,
        42,
        { fullName: "D", address: "W" },
      ]),
      [
        { fullName: "A", address: "X" },
        { fullName: "D", address: "W" },
      ],
    );
  });

  it("returns [] for non-array input", () => {
    assert.deepEqual(normalizeCoBorrowers(null), []);
    assert.deepEqual(normalizeCoBorrowers(undefined), []);
    assert.deepEqual(normalizeCoBorrowers({}), []);
    assert.deepEqual(normalizeCoBorrowers("[]"), []);
  });
});

describe("co-borrower — coBorrowerBannerState (Phase 6, advisory)", () => {
  it("not_required when the committee did not ask", () => {
    assert.equal(
      coBorrowerBannerState({ coBorrowerRequired: false, coBorrowers: [] }),
      "not_required",
    );
    assert.equal(
      coBorrowerBannerState({ coBorrowerRequired: false, coBorrowers: one }),
      "not_required",
    );
  });

  it("missing when required but nothing on file", () => {
    assert.equal(
      coBorrowerBannerState({ coBorrowerRequired: true, coBorrowers: [] }),
      "missing",
    );
  });

  it("provided when required and at least one is on file", () => {
    assert.equal(
      coBorrowerBannerState({ coBorrowerRequired: true, coBorrowers: one }),
      "provided",
    );
  });
});
