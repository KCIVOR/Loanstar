import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMPLOYMENT_CONTRACT_BLOCKER,
  EMPLOYMENT_CONTRACT_MISSING_ERROR,
  assertEmploymentContractForRelease,
  assertLraIntakeUploadAllowed,
  isEmploymentContractStatus,
  releaseBlockerForReadyRelease,
} from "../employment-contract";

describe("employment contract before release (Phase 10)", () => {
  it("treats uploaded and confirmed as present", () => {
    assert.equal(isEmploymentContractStatus("uploaded"), true);
    assert.equal(isEmploymentContractStatus("confirmed"), true);
    assert.equal(isEmploymentContractStatus("pending"), false);
    assert.equal(isEmploymentContractStatus(null), false);
  });

  it("blocks release when contract is missing", () => {
    assert.throws(
      () => assertEmploymentContractForRelease(false),
      new RegExp(EMPLOYMENT_CONTRACT_MISSING_ERROR),
    );
  });

  it("allows release when contract is present", () => {
    assert.doesNotThrow(() => assertEmploymentContractForRelease(true));
  });

  it("sets Pending: employment contract blocker when missing at ready_release", () => {
    assert.equal(
      releaseBlockerForReadyRelease("with_pdc", false),
      EMPLOYMENT_CONTRACT_BLOCKER,
    );
    assert.equal(
      releaseBlockerForReadyRelease("without_pdc", false),
      EMPLOYMENT_CONTRACT_BLOCKER,
    );
  });

  it("keeps path-specific ready_release blocker when contract is present", () => {
    assert.equal(
      releaseBlockerForReadyRelease("with_pdc", true),
      "Documents signed, awaiting check release",
    );
    assert.equal(
      releaseBlockerForReadyRelease("without_pdc", true),
      "Documents signed, awaiting cash release",
    );
  });

  it("allows LRA intake upload only for contract slug", () => {
    assert.doesNotThrow(() =>
      assertLraIntakeUploadAllowed("intake", "contract"),
    );
    assert.throws(
      () => assertLraIntakeUploadAllowed("intake", "passport"),
      /LRA may only upload the employment contract/,
    );
    assert.doesNotThrow(() =>
      assertLraIntakeUploadAllowed("release", "signed_check_voucher"),
    );
  });
});
