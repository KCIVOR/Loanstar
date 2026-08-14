import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  masterlistEmploymentLabels,
  masterlistSecondaryIdentity,
} from "../masterlist-display";
import {
  masterlistToCsv,
  masterlistToExportRow,
  resolveMasterlistEmploymentFields,
} from "../masterlist";

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

describe("masterlistToExportRow", () => {
  it("joins release_paths and copies atm_account_number", () => {
    const row = masterlistToExportRow({
      loan_account_no: "LS-1",
      borrower_no: "B-1",
      borrower_name: "Ada",
      principal: 1000,
      total_loan: 1100,
      net_released: 900,
      monthly_amortization: 100,
      terms: 12,
      first_payment_date: "2026-09-10",
      release_date: "2026-08-14",
      loan_type_name: "G1",
      manning_agency: "Marlow",
      vessel_name: "MV Example",
      outstanding_balance: 1100,
      aging_bucket: "current",
      account_status: "active",
      release_paths: ["with_pdc", "without_pdc"],
      atm_bank_name: "BDO",
      atm_card_last4: "1234",
      atm_account_number: "0011223344",
    });
    assert.equal(row.release_paths, "with_pdc, without_pdc");
    assert.equal(row.atm_account_number, "0011223344");
    assert.equal(row.atm_bank_name, "BDO");
    assert.equal(row.atm_card_last4, "1234");
  });

  it("exports an empty string when release_paths is missing", () => {
    const row = masterlistToExportRow({});
    assert.equal(row.release_paths, "");
    assert.equal(row.atm_account_number, undefined);
  });
});

describe("masterlistToCsv", () => {
  it("quotes joined release_paths in CSV", () => {
    const csv = masterlistToCsv([
      {
        release_paths: ["with_pdc", "without_pdc"],
        atm_account_number: "0011223344",
      },
    ]);
    assert.match(csv, /"with_pdc, without_pdc"/);
    assert.match(csv, /atm_account_number/);
    assert.match(csv, /0011223344/);
    assert.doesNotMatch(csv, /release_path,/);
  });
});
