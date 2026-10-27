import assert from "node:assert/strict";
import { test } from "node:test";
import { requestEmailChange, approveEmailChange, inspectEmailChange, hashApprovalToken, approvalOrigin, type EmailChangeDependencies, type EmailChangeRequest } from "../email-change";

const actor = { id: "11111111-1111-4111-8111-111111111111", email: "old@example.com" };
const request: EmailChangeRequest = { id: "22222222-2222-4222-8222-222222222222", oldEmail: actor.email, newEmail: "new@example.com", status: "pending", expiresAt: "2026-10-27T07:00:00Z" };
const token = "a".repeat(64);
function fixture(overrides: Partial<EmailChangeDependencies> = {}) {
  const calls: string[] = [];
  const deps: EmailChangeDependencies = {
    rpc: async (action) => { calls.push(action); return { ...request, status: action === "claim" ? "processing" : action === "inspect" ? "completed" : "pending" }; },
    sendApproval: async () => { calls.push("send"); },
    updateAuthEmail: async (email) => { calls.push("update"); return { email }; },
    isDefiniteRejection: () => false,
    ...overrides,
  };
  return { deps, calls };
}
test("sends approval only to the current mailbox, with fragment-only token and stored digest", async () => {
  let digest = "";
  const { deps } = fixture({
    rpc: async (action, params) => { assert.equal(action, "start"); assert.equal(params.p_user_id, actor.id); assert.equal(params.p_new_email, request.newEmail); digest = params.p_token_hash!; return request; },
    sendApproval: async ({ to, approvalUrl }) => {
      assert.equal(to, actor.email);
      const url = new URL(approvalUrl);
      assert.equal(url.search, "");
      assert.equal(url.pathname, "/auth/email-change");
      const raw = new URLSearchParams(url.hash.slice(1)).get("approval_token")!;
      assert.match(raw, /^[a-f0-9]{64}$/);
      assert.equal(hashApprovalToken(raw), digest);
    },
  });
  const result = await requestEmailChange(actor, " NEW@example.com ", "http://localhost:3000", deps);
  assert.equal(result.newEmail, request.newEmail);
  assert.equal("token" in result, false);
});
test("SMTP failure closes the undelivered request without changing identity", async () => {
  const { deps, calls } = fixture({ sendApproval: async () => { throw new Error("SMTP secret"); } });
  await assert.rejects(requestEmailChange(actor, request.newEmail, "http://localhost:3000", deps), /Unable to send/);
  assert.deepEqual(calls, ["start", "delivery_failed"]);
});
test("approval claims bound request before identity update and verifies transactional completion", async () => {
  const { deps, calls } = fixture();
  assert.equal((await approveEmailChange(actor, request.id, token, deps)).status, "email_changed");
  assert.deepEqual(calls, ["claim", "update", "inspect"]);
});
test("inspection does not claim or update identity", async () => {
  const { deps, calls } = fixture(); await inspectEmailChange(actor, request.id, token, deps);
  assert.deepEqual(calls, ["inspect"]);
});
test("completed request replay is idempotent", async () => {
  const { deps, calls } = fixture({ rpc: async () => ({ ...request, status: "completed" }) });
  assert.equal((await approveEmailChange(actor, request.id, token, deps)).status, "email_changed");
  assert.deepEqual(calls, []);
});
test("uncertain network error retains processing lock and never claims success", async () => {
  const { deps, calls } = fixture({ updateAuthEmail: async () => { throw new Error("network"); } });
  await assert.rejects(approveEmailChange(actor, request.id, token, deps), /could not verify/);
  assert.deepEqual(calls, ["claim"]);
});
test("definite provider rejection closes request with generic response", async () => {
  const { deps, calls } = fixture({ updateAuthEmail: async () => { throw new Error("email_exists private@example.com"); }, isDefiniteRejection: () => true });
  await assert.rejects(approveEmailChange(actor, request.id, token, deps), /Unable to complete/);
  assert.deepEqual(calls, ["claim", "failed"]);
});
test("claim failure or invalid token never calls admin mutation", async () => {
  const { deps, calls } = fixture({ rpc: async () => { throw new Error("invalid"); } });
  await assert.rejects(approveEmailChange(actor, request.id, token, deps), /invalid|expired/);
  await assert.rejects(approveEmailChange(actor, request.id, "bad", deps));
  assert.deepEqual(calls, []);
});
test("successful Auth response without completed journal is not reported as success", async () => {
  const { deps } = fixture({ rpc: async () => ({ ...request, status: "processing" }) });
  await assert.rejects(approveEmailChange(actor, request.id, token, deps), /could not verify/);
});
test("requires trusted HTTPS production origin, allows localhost for development", () => {
  assert.equal(approvalOrigin("http://localhost:3000", undefined, false), "http://localhost:3000");
  assert.throws(() => approvalOrigin("https://attacker.example", undefined, true));
  assert.equal(approvalOrigin("https://attacker.example", "https://loanstar.example", true), "https://loanstar.example");
  assert.throws(() => approvalOrigin("https://loanstar.example", "http://loanstar.example", true));
});
