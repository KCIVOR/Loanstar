import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mapCommitteeCollateralInspections,
  resolveCommitteeCollateralType,
} from "../ci-report";

describe("resolveCommitteeCollateralType", () => {
  it("returns car_refinancing when the application carries vehicle collateral", () => {
    assert.equal(
      resolveCommitteeCollateralType("car_refinancing"),
      "car_refinancing",
    );
  });

  it("returns real_estate when the application carries property collateral", () => {
    assert.equal(resolveCommitteeCollateralType("real_estate"), "real_estate");
  });

  it("returns none for seafarer, clean loans, and unknown values", () => {
    assert.equal(resolveCommitteeCollateralType("none"), "none");
    assert.equal(resolveCommitteeCollateralType(null), "none");
    assert.equal(resolveCommitteeCollateralType(undefined), "none");
    assert.equal(resolveCommitteeCollateralType("something_else"), "none");
  });
});

describe("mapCommitteeCollateralInspections", () => {
  it("maps CM and REM inspection JSON so Committee can show the forms CIG filled", () => {
    const mapped = mapCommitteeCollateralInspections({
      cm_inspection: {
        account: { accountName: "Juan Dela Cruz" },
        orCrDetails: { plateNumber: "ABC 1234" },
        verifiedBy: "CIG (Seed)",
      },
      rem_inspection: {
        account: { accountName: "Maria Santos" },
        titleDetails: { registeredOwnerAtTitle: "Maria Santos" },
        verifiedBy: "CIG (Seed)",
      },
    });

    assert.equal(mapped.cmInspection?.account?.accountName, "Juan Dela Cruz");
    assert.equal(mapped.cmInspection?.orCrDetails?.plateNumber, "ABC 1234");
    assert.equal(mapped.cmInspection?.verifiedBy, "CIG (Seed)");
    assert.equal(mapped.remInspection?.account?.accountName, "Maria Santos");
    assert.equal(
      mapped.remInspection?.titleDetails?.registeredOwnerAtTitle,
      "Maria Santos",
    );
  });

  it("returns null inspections when CIG has not recorded collateral forms", () => {
    const mapped = mapCommitteeCollateralInspections({
      cm_inspection: null,
      rem_inspection: null,
    });
    assert.equal(mapped.cmInspection, null);
    assert.equal(mapped.remInspection, null);
  });
});
