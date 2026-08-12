import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  masterlistEmploymentLabels,
  masterlistSecondaryIdentity,
} from "../masterlist-display";
import { resolveMasterlistEmploymentFields } from "../masterlist";

describe("resolveMasterlistEmploymentFields", () => {
  it("keeps Seafarer manning / vessel", () => {
    assert.deepEqual(
      resolveMasterlistEmploymentFields({
        segment: "seafarer",
        manningAgencyName: "Marlow Navigation",
        vesselName: "MV Example",
        businessInfo: { companyName: "Should ignore" },
      }),
      { manningAgency: "Marlow Navigation", vesselName: "MV Example" },
    );
  });

  it("maps SME business_info into manning_agency / vessel_name slots", () => {
    assert.deepEqual(
      resolveMasterlistEmploymentFields({
        segment: "sme",
        manningAgencyName: "ignored",
        vesselName: "ignored",
        businessInfo: {
          companyName: "Acme Trading Corp.",
          natureOfBusiness: "Wholesale trade",
          officeAddress: "123 Rizal Ave",
        },
      }),
      {
        manningAgency: "Acme Trading Corp.",
        vesselName: "Wholesale trade",
      },
    );
  });

  it("falls back to office address when nature is empty", () => {
    assert.deepEqual(
      resolveMasterlistEmploymentFields({
        segment: "sme",
        businessInfo: {
          companyName: "Acme",
          companyAddress: "QC",
        },
      }),
      { manningAgency: "Acme", vesselName: "QC" },
    );
  });
});

describe("masterlistEmploymentLabels", () => {
  it("returns Company / Nature for SME and Manning / Vessel for Seafarer", () => {
    assert.deepEqual(masterlistEmploymentLabels("sme"), {
      employer: "Company",
      secondary: "Nature of business",
    });
    assert.deepEqual(masterlistEmploymentLabels("seafarer"), {
      employer: "Manning agency",
      secondary: "Vessel",
    });
  });
});

describe("masterlistSecondaryIdentity", () => {
  it("joins non-empty parts", () => {
    assert.equal(
      masterlistSecondaryIdentity({
        manning_agency: "Acme",
        vessel_name: "Wholesale",
      }),
      "Acme · Wholesale",
    );
    assert.equal(
      masterlistSecondaryIdentity({
        manning_agency: "Marlow",
        vessel_name: null,
      }),
      "Marlow",
    );
    assert.equal(
      masterlistSecondaryIdentity({
        manning_agency: null,
        vessel_name: null,
      }),
      null,
    );
  });
});
