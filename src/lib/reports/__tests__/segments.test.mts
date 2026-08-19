import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  asCollateralType,
  asLoanSegment,
  collateralLabel,
  parseReportCollateral,
  parseReportSegment,
  REPORT_SEGMENTS,
  segmentLabel,
} from "../segments";

describe("parseReportSegment", () => {
  it("accepts Individual instead of silently falling back to All", () => {
    assert.equal(parseReportSegment("individual"), "individual");
    assert.equal(parseReportSegment("sme"), "sme");
    assert.equal(parseReportSegment("nope"), "all");
    assert.equal(parseReportSegment(null), "all");
  });

  it("lists every live book", () => {
    assert.deepEqual([...REPORT_SEGMENTS], ["all", "seafarer", "sme", "individual"]);
  });
});

describe("parseReportCollateral", () => {
  it("accepts the three product shapes", () => {
    assert.equal(parseReportCollateral("none"), "none");
    assert.equal(parseReportCollateral("car_refinancing"), "car_refinancing");
    assert.equal(parseReportCollateral("real_estate"), "real_estate");
    assert.equal(parseReportCollateral("vessel"), "all");
  });
});

describe("asLoanSegment / asCollateralType", () => {
  it("drops unknown segments rather than coercing them to Seafarer", () => {
    assert.equal(asLoanSegment("individual"), "individual");
    assert.equal(asLoanSegment("other"), null);
    assert.equal(asLoanSegment(null), null);
  });

  it("treats missing collateral as clean, not as a new product", () => {
    assert.equal(asCollateralType(null), "none");
    assert.equal(asCollateralType("car_refinancing"), "car_refinancing");
  });
});

describe("labels", () => {
  it("title-cases the three books and the two collateral products", () => {
    assert.equal(segmentLabel("individual"), "Individual");
    assert.equal(segmentLabel("sme"), "SME");
    assert.equal(collateralLabel("car_refinancing"), "Car refinancing");
    assert.equal(collateralLabel("real_estate"), "Real estate");
    assert.equal(collateralLabel("none"), "Clean");
  });
});
