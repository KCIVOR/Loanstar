import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCollateralDocumentContextFromRaw,
  mapPropertyEntryToDocumentRow,
  mapVehicleEntryToDocumentRow,
} from "../collateral-context";

describe("mapVehicleEntryToDocumentRow", () => {
  it("maps every field the mortgage document templates use", () => {
    const row = mapVehicleEntryToDocumentRow({
      orCrDetails: {
        makeYearModel: "2022 Toyota Vios",
        plateNumber: "ABC 1234",
        engineNo: "ENG1",
        chasisNo: "CHS1",
        mvFile: "MV1",
        crNo: "CR1",
      },
      registration: { registeredOwner: "Jonathan Del Poso" },
    });
    assert.deepEqual(row, {
      makeYearModel: "2022 Toyota Vios",
      plateNo: "ABC 1234",
      engineNo: "ENG1",
      chassisNo: "CHS1",
      mvFileNo: "MV1",
      crNo: "CR1",
      registeredOwner: "Jonathan Del Poso",
    });
  });

  it("missing fields resolve to empty strings, never undefined/null leaking into a template", () => {
    const row = mapVehicleEntryToDocumentRow({});
    for (const value of Object.values(row)) {
      assert.equal(typeof value, "string");
    }
  });
});

describe("mapPropertyEntryToDocumentRow", () => {
  it("maps every field the mortgage document templates use", () => {
    const row = mapPropertyEntryToDocumentRow({
      legalDescription: {
        location: "Quezon City",
        tctNo: "T-123456",
        areaSqm: 250,
        technicalDescription: "A parcel of land...",
      },
    });
    assert.deepEqual(row, {
      location: "Quezon City",
      tctNo: "T-123456",
      areaSqm: "250",
      technicalDescription: "A parcel of land...",
    });
  });

  it("missing fields resolve to empty strings", () => {
    const row = mapPropertyEntryToDocumentRow({});
    for (const value of Object.values(row)) {
      assert.equal(typeof value, "string");
    }
  });
});

describe("buildCollateralDocumentContextFromRaw — the actual audit-gap fix", () => {
  it("multiple vehicles from the CI form become multiple document rows (not just the first, not empty)", () => {
    const ctx = buildCollateralDocumentContextFromRaw(
      {
        account: { accountName: "Acct" },
        vehicles: [
          { orCrDetails: { plateNumber: "AAA 111" } },
          { orCrDetails: { plateNumber: "BBB 222" } },
          { orCrDetails: { plateNumber: "CCC 333" } },
        ],
        verifiedBy: "Investigator",
      },
      null,
    );
    assert.equal(ctx.vehicles.length, 3);
    assert.deepEqual(
      ctx.vehicles.map((v) => v.plateNo),
      ["AAA 111", "BBB 222", "CCC 333"],
    );
    assert.deepEqual(ctx.properties, []);
  });

  it("multiple properties from the CI form become multiple document rows", () => {
    const ctx = buildCollateralDocumentContextFromRaw(null, {
      account: { accountName: "Acct" },
      properties: [
        { legalDescription: { tctNo: "T-1" } },
        { legalDescription: { tctNo: "T-2" } },
      ],
      verifiedBy: "Investigator",
    });
    assert.equal(ctx.properties.length, 2);
    assert.deepEqual(
      ctx.properties.map((p) => p.tctNo),
      ["T-1", "T-2"],
    );
  });

  it("a legacy (pre-redesign) single-vehicle CI row still produces one document row, not zero", () => {
    const ctx = buildCollateralDocumentContextFromRaw(
      {
        account: { accountName: "Acct" },
        orCrDetails: { plateNumber: "XYZ 999" },
        verifiedBy: "Investigator",
      },
      null,
    );
    assert.equal(ctx.vehicles.length, 1);
    assert.equal(ctx.vehicles[0]?.plateNo, "XYZ 999");
  });

  it("no CI record at all resolves to empty arrays, not a thrown error", () => {
    const ctx = buildCollateralDocumentContextFromRaw(null, null);
    assert.deepEqual(ctx, { vehicles: [], properties: [] });
  });
});
