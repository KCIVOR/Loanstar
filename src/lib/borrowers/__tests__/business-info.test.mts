import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  emptyBusinessInfo,
  parseBusinessInfo,
  type BusinessInfo,
} from "../business-info";

describe("parseBusinessInfo (SME Phase 3)", () => {
  it("returns empty object for null/invalid input", () => {
    assert.deepEqual(parseBusinessInfo(null), emptyBusinessInfo());
    assert.deepEqual(parseBusinessInfo(undefined), emptyBusinessInfo());
    assert.deepEqual(parseBusinessInfo("x"), emptyBusinessInfo());
    assert.deepEqual(parseBusinessInfo([]), emptyBusinessInfo());
  });

  it("passes through Individual form fields from the client PDF", () => {
    const info: BusinessInfo = {
      companyName: "Ana Trading",
      companyAddress: "123 Market St",
      yearsOfOperation: "5",
      position: "Owner",
      businessGrossIncome: "100000",
      businessNetIncome: "30000",
    };
    assert.deepEqual(parseBusinessInfo(info), info);
  });

  it("passes through Corporate form fields from the client PDF", () => {
    const info: BusinessInfo = {
      companyName: "RC Ramos Construction",
      acronym: "RCRC",
      officeAddress: "Makati",
      natureOfBusiness: "Construction",
      tin: "123-456-789",
      dateEstablished: "2010-01-01",
      companyOfficers: [{ name: "Ramos", position: "President" }],
      majorStockholders: [{ name: "Ramos", equity: "100%" }],
      tradeCustomers: [{ name: "Client", contactNo: "1" }],
      tradeSuppliers: [{ name: "Supply", contactNo: "2" }],
      creditReferences: [{ creditorBank: "BDO", outstandingBalance: "1" }],
      bankAccounts: [{ bankName: "BDO", accountNo: "9" }],
      bankAuthorizationAccount: "BDO-9",
    };
    assert.deepEqual(parseBusinessInfo(info), info);
  });

  it("passes through Individual spouse + income declaration fields", () => {
    const info: BusinessInfo = {
      spouse: {
        firstName: "Maria",
        lastName: "Cruz",
        companyOrEmployerName: "Store",
      },
      spouseGrossIncome: "20000",
      spouseLessExpenses: "5000",
      spouseNetIncome: "15000",
    };
    assert.deepEqual(parseBusinessInfo(info), info);
  });
});
