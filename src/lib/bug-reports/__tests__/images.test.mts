import assert from "node:assert/strict";
import test from "node:test";

import { imageTypeFromBytes } from "../images";

test("accepts JPEG, PNG, and WebP signatures", () => {
  assert.equal(imageTypeFromBytes(Uint8Array.from([255, 216, 255, 0])), "image/jpeg");
  assert.equal(imageTypeFromBytes(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])), "image/png");
  assert.equal(imageTypeFromBytes(new TextEncoder().encode("RIFFxxxxWEBP")), "image/webp");
});

test("rejects arbitrary bytes and incomplete signatures", () => {
  assert.equal(imageTypeFromBytes(new TextEncoder().encode("<svg>")), null);
  assert.equal(imageTypeFromBytes(Uint8Array.from([255, 216])), null);
});
