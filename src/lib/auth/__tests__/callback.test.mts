import assert from "node:assert/strict";
import { test } from "node:test";
import {
  finishAuthCallback, processAuthCallback, emailConfirmationFeedback,
  rememberEmailConfirmation, consumeEmailConfirmation, type CallbackAuth,
} from "../callback";

function auth(overrides: Partial<CallbackAuth> = {}): CallbackAuth {
  return {
    initialize: async () => ({ error: null }),
    getSession: async () => ({ data: { session: {} }, error: null }),
    setSession: async () => ({ error: null }),
    verifyOtp: async () => ({ error: null }),
    ...overrides,
  };
}
test("handles implicit recovery tokens explicitly despite PKCE client", async () => {
  let tokens: unknown;
  assert.equal(await finishAuthCallback(auth({ setSession: async (value) => { tokens = value; return { error: null }; } }),
    new URL("https://example.com/reset-password#access_token=a&refresh_token=b&type=recovery")), true);
  assert.deepEqual(tokens, { access_token: "a", refresh_token: "b" });
});
test("surfaces expired-link errors instead of accepting an existing session", async () => {
  await assert.rejects(finishAuthCallback(auth(), new URL("https://example.com/reset-password#error_description=Link+expired")), /Link expired/);
});
test("reports automatic PKCE exchange failure", async () => {
  await assert.rejects(finishAuthCallback(auth({ initialize: async () => ({ error: { message: "Invalid verifier" } }) }), new URL("https://example.com/auth/confirm?code=invalid")), /Invalid verifier/);
});
test("verifies email token hashes with an allowlisted type", async () => {
  let verified: unknown;
  await finishAuthCallback(auth({ verifyOtp: async (value) => { verified = value; return { error: null }; } }), new URL("https://example.com/auth/confirm?token_hash=hash&type=email_change"));
  assert.deepEqual(verified, { token_hash: "hash", type: "email_change" });
  await assert.rejects(finishAuthCallback(auth(), new URL("https://example.com/auth/confirm?token_hash=hash&type=invite")), /Unsupported/);
});
test("returns false when recovery has no session", async () => {
  assert.equal(await finishAuthCallback(auth({ getSession: async () => ({ data: { session: null }, error: null }) }), new URL("https://example.com/reset-password")), false);
});

const firstConfirmation = "Confirmation link accepted. Please proceed to confirm link sent to the other email";
test("preserves first-confirmation messages in query and fragment despite an existing session", async () => {
  for (const separator of ["?", "#"]) {
    const result = await processAuthCallback(auth(), new URL(`https://example.com/auth/confirm${separator}message=${encodeURIComponent(firstConfirmation)}`));
    assert.equal(result.hasSession, true);
    assert.equal(result.outcome, "pending");
    assert.equal(result.providerMessage, firstConfirmation);
    assert.equal(result.confirmedEmail, null);
  }
});
test("an existing session or a forged success hint is not confirmation evidence", async () => {
  const result = await processAuthCallback(auth(), new URL("https://example.com/auth/confirm?emailConfirmation=verified"));
  assert.equal(result.outcome, "unverified");
  assert.equal(emailConfirmationFeedback(result, { email: "old@example.com", pendingEmail: null }).kind, "info");
});
test("token-hash first confirmation with null user/session is pending", async () => {
  const result = await processAuthCallback(auth({ verifyOtp: async () => ({ data: { session: null, user: null }, error: null }) }),
    new URL("https://example.com/auth/confirm?token_hash=token&type=email_change"));
  assert.equal(result.outcome, "pending");
});
test("completed token verification must agree with authoritative email and no pending change", async () => {
  const session = { user: { email: "new@example.com" } };
  const result = await processAuthCallback(auth({
    verifyOtp: async () => ({ data: { session, user: session.user }, error: null }),
    getSession: async () => ({ data: { session }, error: null }),
  }), new URL("https://example.com/auth/confirm?token_hash=token&type=email_change"));
  assert.equal(result.outcome, "verified");
  assert.equal(emailConfirmationFeedback(result, { email: "new@example.com", pendingEmail: null }).kind, "success");
  assert.equal(emailConfirmationFeedback(result, { email: "old@example.com", pendingEmail: null }).kind, "info");
  assert.match(emailConfirmationFeedback(result, { email: "old@example.com", pendingEmail: "new@example.com" }).text, /other email/);
});
test("PKCE requires a consumed code, not just initialization without an error", async () => {
  const url = new URL("https://example.com/auth/confirm?code=authorization-code");
  const provider = auth({ getSession: async () => ({ data: { session: { user: { email: "new@example.com" } } }, error: null }) });
  assert.equal((await processAuthCallback(provider, url, () => url)).outcome, "unverified");
  assert.equal((await processAuthCallback(provider, url, () => new URL("https://example.com/auth/confirm"))).outcome, "verified");
});
test("email confirmation handoff is one-use and excludes tokens", async () => {
  const result = await processAuthCallback(auth(), new URL(`https://example.com/auth/confirm?message=${encodeURIComponent(firstConfirmation)}`));
  rememberEmailConfirmation(result);
  assert.deepEqual(consumeEmailConfirmation(), result);
  assert.equal(consumeEmailConfirmation(), null);
  assert.equal(JSON.stringify(result).includes("access_token"), false);
});
test("callback messages redact secrets and provider errors still fail with an existing session", async () => {
  const secret = "sensitive-authorization-code";
  const result = await processAuthCallback(auth(), new URL(`https://example.com/auth/confirm?code=${secret}&message=${encodeURIComponent(`Please confirm the other email; code=${secret}`)}`));
  assert.equal(JSON.stringify(result).includes(secret), false);
  for (const error of ["Link expired", "Invalid link", "Link already used"]) {
    await assert.rejects(processAuthCallback(auth(), new URL(`https://example.com/auth/confirm#error_description=${encodeURIComponent(error)}`)), new RegExp(error));
  }
});
test("recovery session establishment is never evidence of an email change", async () => {
  const session = { user: { email: "old@example.com" } };
  const provider = auth({
    verifyOtp: async () => ({ data: { session, user: session.user }, error: null }),
    setSession: async () => ({ data: { session, user: session.user }, error: null }),
    getSession: async () => ({ data: { session }, error: null }),
  });
  for (const link of [
    "https://example.com/auth/confirm?token_hash=token&type=recovery",
    "https://example.com/auth/confirm#access_token=synthetic-access&refresh_token=synthetic-refresh&type=recovery",
  ]) {
    const result = await processAuthCallback(provider, new URL(link));
    assert.equal(result.hasSession, true);
    assert.equal(result.outcome, "unverified");
    assert.equal(emailConfirmationFeedback(result, { email: session.user.email, pendingEmail: null }).kind, "info");
  }
  assert.equal(await finishAuthCallback(provider, new URL("https://example.com/reset-password?token_hash=token&type=recovery")), true);
});
