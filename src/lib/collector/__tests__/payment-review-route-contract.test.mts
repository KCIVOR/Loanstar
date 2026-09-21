import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const patchSrc = readFileSync(
  new URL("../../../app/api/collector/payments/[id]/route.ts", import.meta.url),
  "utf8",
);
const downloadSrc = readFileSync(
  new URL(
    "../../../app/api/collector/payments/[id]/download/route.ts",
    import.meta.url,
  ),
  "utf8",
);

test("PATCH review route scopes to the assigned reviewer", () => {
  assert.match(patchSrc, /canReviewAssignedPayment/);
  assert.match(patchSrc, /getPaymentReviewContext/);
  assert.match(patchSrc, /hasModulePermission\("remedial", "edit"/);
  assert.match(patchSrc, /hasModulePermission\("collection", "edit"/);
  assert.doesNotMatch(patchSrc, /requireModulePermission/);
});

test("PATCH review route keeps the pending-only guard and notifies borrower", () => {
  assert.match(patchSrc, /\.eq\("status", "pending_verification"\)/);
  assert.match(patchSrc, /notifyBorrowerForApplication/);
  assert.match(patchSrc, /payment_proof_confirmed/);
  assert.match(patchSrc, /payment_proof_rejected/);
  assert.ok(
    patchSrc.indexOf("notifyBorrowerForApplication(") >
      patchSrc.indexOf(".update("),
  );
});

test("download route uses the shared owner rule", () => {
  assert.match(downloadSrc, /canReviewAssignedPayment/);
  assert.match(downloadSrc, /getPaymentReviewContext/);
  assert.match(downloadSrc, /hasModulePermission\("remedial", "view"/);
  assert.doesNotMatch(downloadSrc, /collector_user_id/);
});
