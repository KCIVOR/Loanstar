import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(
  new URL(
    "../../../app/api/borrower/applications/[id]/loan/route.ts",
    import.meta.url,
  ),
  "utf8",
);

test("proof upload notifies the assigned reviewer only", () => {
  assert.match(route, /getProofReviewRecipient\(/);
  assert.match(route, /notifyUser\(/);
  assert.match(route, /kind:\s*"payment_proof_submitted"/);
  assert.ok(!route.includes("user_roles"));
});
