import test from "node:test";
import assert from "node:assert/strict";

import { toCsv } from "../csv";

test("toCsv returns empty string for no rows", () => {
  assert.equal(toCsv([]), "");
});

test("toCsv writes a header row from the first row's keys", () => {
  const csv = toCsv([{ label: "Current", outstanding: 100 }]);
  assert.equal(csv, "label,outstanding\nCurrent,100");
});

test("toCsv quotes cells containing commas, quotes, or newlines", () => {
  const csv = toCsv([{ reason: 'Ran out of funds, "urgent"' }]);
  assert.equal(csv, 'reason\n"Ran out of funds, ""urgent"""');
});

test("toCsv renders null/undefined as an empty cell", () => {
  const csv = toCsv([{ a: null, b: undefined, c: 0 }]);
  assert.equal(csv, "a,b,c\n,,0");
});

test("toCsv handles multiple rows", () => {
  const csv = toCsv([
    { stage: "Draft", count: 6 },
    { stage: "Submitted", count: 10 },
  ]);
  assert.equal(csv, "stage,count\nDraft,6\nSubmitted,10");
});
