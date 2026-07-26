import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPaymentProofStoragePath,
  isAllowedPaymentProofMime,
  assertPaymentProofPathOwnedByBorrower,
} from "../proof-storage";

test("buildPaymentProofStoragePath prefixes borrower id", () => {
  const path = buildPaymentProofStoragePath(
    "borr-1",
    "tmp-123",
    "receipt/../x.pdf",
  );
  assert.equal(path.startsWith("borr-1/payments/tmp-123/"), true);
  assert.equal(path.includes(".."), false);
});

test("isAllowedPaymentProofMime accepts pdf jpeg png webp heic", () => {
  assert.equal(isAllowedPaymentProofMime("application/pdf"), true);
  assert.equal(isAllowedPaymentProofMime("image/heic"), true);
  assert.equal(isAllowedPaymentProofMime("application/zip"), false);
});

test("assertPaymentProofPathOwnedByBorrower rejects foreign prefix", () => {
  assert.throws(() =>
    assertPaymentProofPathOwnedByBorrower("other/payments/a/b.pdf", "borr-1"),
  );
  assert.doesNotThrow(() =>
    assertPaymentProofPathOwnedByBorrower(
      "borr-1/payments/tmp/receipt.pdf",
      "borr-1",
    ),
  );
});
