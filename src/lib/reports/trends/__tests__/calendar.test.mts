import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCoverage,
  daysLateAt,
  inWindow,
  monthWindows,
  parseDate,
} from "../calendar";

const NOW = new Date(2026, 7, 19); // 19 Aug 2026, local

describe("monthWindows", () => {
  it("returns trailing calendar months ending with the month of now", () => {
    const windows = monthWindows(6, NOW);
    assert.equal(windows.length, 6);
    assert.deepEqual(
      windows.map((w) => w.key),
      ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"],
    );
  });

  it("end is the exclusive start of the next month", () => {
    const [march] = monthWindows(1, new Date(2026, 2, 15));
    assert.equal(march!.start.getMonth(), 2);
    assert.equal(march!.end.getMonth(), 3);
    assert.equal(march!.end.getDate(), 1);
  });

  it("crosses a year boundary", () => {
    const windows = monthWindows(3, new Date(2026, 0, 10));
    assert.deepEqual(
      windows.map((w) => w.key),
      ["2025-11", "2025-12", "2026-01"],
    );
  });
});

describe("parseDate", () => {
  it("treats a date-only column as a local calendar day, not UTC midnight", () => {
    const d = parseDate("2026-08-01")!;
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 7);
    assert.equal(d.getDate(), 1);
    assert.equal(d.getHours(), 0);
  });

  it("keeps a real timestamp as an instant", () => {
    assert.equal(parseDate("2026-08-01T12:00:00.000Z")?.toISOString(), "2026-08-01T12:00:00.000Z");
  });

  it("returns null for blank or unparseable input", () => {
    assert.equal(parseDate(null), null);
    assert.equal(parseDate(""), null);
    assert.equal(parseDate("not a date"), null);
  });
});

describe("inWindow", () => {
  const [august] = monthWindows(1, NOW);

  it("includes the first day of the month for a date-only column", () => {
    assert.equal(inWindow("2026-08-01", august!), true);
  });

  it("excludes the first day of the next month", () => {
    assert.equal(inWindow("2026-09-01", august!), false);
  });

  it("excludes the previous month", () => {
    assert.equal(inWindow("2026-07-31", august!), false);
  });
});

describe("daysLateAt", () => {
  const windows = monthWindows(6, NOW);
  const april = windows.find((w) => w.key === "2026-04")!;
  const may = windows.find((w) => w.key === "2026-05")!;
  const july = windows.find((w) => w.key === "2026-07")!;

  it("measures to the last day of the window", () => {
    assert.equal(daysLateAt("2026-04-10", april), 20); // to 30 Apr
    assert.equal(daysLateAt("2026-04-10", may), 51); // to 31 May
    assert.equal(daysLateAt("2026-04-10", july), 112); // to 31 Jul
  });

  it("is negative when the due date has not arrived by the window end", () => {
    assert.ok(daysLateAt("2026-09-10", april) < 0);
  });
});

describe("buildCoverage", () => {
  const windows = monthWindows(6, NOW);

  it("reports no note when every month has data", () => {
    const dates = windows.map((w) => `${w.key}-15`);
    const coverage = buildCoverage("Postings", windows, dates);
    assert.equal(coverage.monthsWithData, 6);
    assert.equal(coverage.requestedMonths, 6);
    assert.equal(coverage.note, null);
  });

  it("names the first month and the shortfall when coverage is partial", () => {
    const coverage = buildCoverage("Committee decisions", windows, [
      "2026-07-23",
      "2026-08-18",
    ]);
    assert.equal(coverage.monthsWithData, 2);
    assert.equal(coverage.firstMonth, "2026-07");
    assert.match(coverage.note ?? "", /2 of the last 6 months/);
    assert.match(coverage.note ?? "", /2026-07/);
  });

  it("says so plainly when there is nothing at all", () => {
    const coverage = buildCoverage("Committee decisions", windows, []);
    assert.equal(coverage.monthsWithData, 0);
    assert.equal(coverage.firstMonth, null);
    assert.match(coverage.note ?? "", /^No Committee decisions recorded/);
  });
});
