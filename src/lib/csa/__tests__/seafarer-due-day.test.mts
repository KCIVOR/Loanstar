import assert from "node:assert/strict";
import { it } from "node:test";
import { validateSeafarerDueDay } from "../computation";

it("accepts each calendar day, including the client's requested 10th", () => {
  for (let day = 1; day <= 31; day++) assert.equal(validateSeafarerDueDay("seafarer", day), null, String(day));
});
it("rejects missing, fractional, nonfinite and out-of-month days", () => {
  for (const day of [undefined, 0, -1, 32, 10.5, NaN, Infinity]) assert.ok(validateSeafarerDueDay("seafarer", day));
});
it("keeps other segments' existing validation behavior", () => {
  assert.equal(validateSeafarerDueDay("sme", undefined), null);
  assert.equal(validateSeafarerDueDay("individual", undefined), null);
});
