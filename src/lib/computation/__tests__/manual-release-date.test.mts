import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  computeFirstPaymentDate,
  computeSmeFirstPaymentDate,
} from "../release-date";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("first payment date follows the release date staff chose", () => {
  it("Seafarer: matches the client's Excel (release 2026-07-20, 2 add-on months, due day 15 → 2026-09-15)", () => {
    assert.equal(ymd(computeFirstPaymentDate(new Date(2026, 6, 20), 2, 15)), "2026-09-15");
  });

  it("Seafarer: a release on or after the 22nd rolls to the next cutoff month", () => {
    assert.equal(ymd(computeFirstPaymentDate(new Date(2026, 6, 22), 2, 15)), "2026-10-15");
  });

  it("Seafarer: a past release date and a later one give different first payments", () => {
    const past = ymd(computeFirstPaymentDate(new Date(2026, 9, 10), 2, 15));
    const later = ymd(computeFirstPaymentDate(new Date(2026, 10, 25), 2, 15));
    assert.equal(past, "2026-12-15");
    assert.equal(later, "2027-02-15");
  });

  it("SME / Individual: one month after release plus add-on months, same day", () => {
    assert.equal(ymd(computeSmeFirstPaymentDate(new Date(2026, 10, 16), 0)), "2026-12-16");
    assert.equal(ymd(computeSmeFirstPaymentDate(new Date(2026, 9, 31), 0)), "2026-11-30");
  });
});

describe("release date is kept as entered (source checks)", () => {
  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
  const computationSrc = read("../../csa/computation.ts");
  const releaseSrc = read("../../lra/release-service.ts");
  const csaRoute = read("../../../app/api/csa/applications/[id]/computation/route.ts");
  const committeeRoute = read("../../../app/api/committee/applications/[id]/override/route.ts");

  it("reads the date as a local calendar date and stores it without a UTC shift", () => {
    assert.match(computationSrc, /parseLocalDate\(input\.releaseDate\)/);
    assert.match(computationSrc, /release_date: formatDateLocal\(releaseDate\)/);
    assert.doesNotMatch(computationSrc, /release_date: releaseDate\.toISOString/);
  });

  it("LRA recordRelease no longer overwrites computations.release_date", () => {
    assert.doesNotMatch(releaseSrc, /update\(\{\s*release_date:/);
  });

  it("Committee adjust/override keeps the release date for every schedule type", () => {
    const negotiationSrc = read("../../negotiation/service.ts");
    assert.match(negotiationSrc, /releaseDate: resolvedReleaseDate,/);
    assert.doesNotMatch(
      negotiationSrc,
      /resolvedPaymentSchedule === "daily" \? resolvedReleaseDate : undefined/,
    );
  });

  it("both Compute routes validate a provided release date", () => {
    assert.match(csaRoute, /Release date must be a valid date \(YYYY-MM-DD\)/);
    assert.match(committeeRoute, /Release date must be a valid date \(YYYY-MM-DD\)/);
  });
});
