// Isolated browser verification of the real Settings component. No real Auth calls.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { build } from "esbuild";
import { chromium } from "@playwright/test";

const bundle = await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Settings from './src/app/settings/page'; import Confirm from './src/app/auth/confirm/page'; import Approval from './src/app/auth/email-change/page'; const root = createRoot(document.getElementById('root')); function render() { root.render(window.location.pathname === '/auth/confirm' ? <Confirm /> : window.location.pathname === '/auth/email-change' ? <Approval /> : window.location.pathname === '/login' ? <p>Sign in with your updated email address and existing password.</p> : <Settings />); } window.addEventListener('testnavigate', render); render();`, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, write: false, platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' },
  banner: { js: 'var process = { env: { NODE_ENV: "production" } };' },
  plugins: [{ name: "test-permissions", setup(plugin) {
    plugin.onResolve({ filter: /^@\/hooks\/usePermissions$/ }, () => ({ path: "permissions", namespace: "fixture" }));
    plugin.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: "auth", namespace: "fixture" }));
    plugin.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "fixture" }));
    plugin.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: path === "permissions"
      ? "export const usePermissions = () => ({ refresh: async () => {} });"
      : path === "auth" ? "export const createClient = () => ({ auth: window.testAuth });"
        : "const router = { replace(path) { window.history.replaceState(null, '', path); window.dispatchEvent(new Event('testnavigate')); } }; export const useRouter = () => router;" }));
  } }],
});
let pendingEmail = null;
let currentEmail = "old@example.com";
let approvalState = "pending";
let approvalConfirms = 0;
let verificationMode = "current_email";
const styles = await postcss([tailwind()]).process(
  (await readFile("src/app/globals.css", "utf8")).replace('@import "tailwindcss";', '@import "tailwindcss" source(none);\n@source "../";'),
  { from: "src/app/globals.css" },
);
let rejectLoad = false;
let securityReads = 0;
let rejectPassword = false;
const payloads = [];
const server = createServer(async (request, response) => {
  if (request.url === "/bundle.js") {
    response.setHeader("Content-Type", "application/javascript");
    response.end(bundle.outputFiles[0].text);
  } else if (request.url === "/styles.css") {
    response.setHeader("Content-Type", "text/css");
    response.end(styles.css);
  } else if (request.url === "/api/account/email-change") {
    response.setHeader("Content-Type", "application/json");
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const input = JSON.parse(raw);
    if (input.token !== "a".repeat(64)) { response.statusCode = 400; return response.end(JSON.stringify({ error: "Invalid approval" })); }
    if (input.action === "confirm") {
      approvalConfirms++;
      approvalState = "completed"; currentEmail = "new@example.com"; pendingEmail = null;
      return response.end(JSON.stringify({ status: "email_changed", email: currentEmail }));
    }
    return response.end(JSON.stringify({ id: input.requestId, oldEmail: "old@example.com", newEmail: "new@example.com", status: approvalState, expiresAt: "2026-10-27T07:00:00Z" }));
  } else if (request.url === "/api/account/security") {
    response.setHeader("Content-Type", "application/json");
    if (request.method === "GET") {
      securityReads++;
      if (rejectLoad) { response.statusCode = 503; return response.end(JSON.stringify({ error: "Unable to load account details" })); }
      return response.end(JSON.stringify({ email: currentEmail, pendingEmail, verificationMode }));
    }
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const input = JSON.parse(raw);
    payloads.push(input);
    if (input.kind === "password" && rejectPassword) {
      response.statusCode = 400;
      return response.end(JSON.stringify({ error: "Current password is incorrect" }));
    }
    if (input.kind === "email") pendingEmail = input.email;
    response.end(JSON.stringify({ status: input.kind === "email" ? "email_verification_pending" : "password_changed" }));
  } else {
    response.setHeader("Content-Type", "text/html");
    response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/styles.css"></head><body><main id="root" style="padding:24px"></main><script src="/bundle.js"></script></body></html>');
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
const errors = [];
let page;
try {
  page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const mode = new URL(window.location.href).searchParams.get("testCallback");
    const session = { user: { email: mode === "completed" ? "new@example.com" : "old@example.com" } };
    window.testAuth = {
      async initialize() {
        if (mode === "invalid") return { error: { message: "Invalid or already used confirmation link" } };
        if (mode !== "unconsumed") {
          const url = new URL(window.location.href);
          url.searchParams.delete("code");
          window.history.replaceState(null, "", url);
        }
        return { error: null };
      },
      signOut: async (options) => {
        window.signOutCalls = (window.signOutCalls || 0) + 1;
        window.signOutScope = options.scope;
        return { error: window.rejectSignOut ? { message: "Synthetic logout failure" } : null };
      },
      getSession: async () => ({ data: { session }, error: null }),
      setSession: async () => ({ data: { session }, error: null }),
      verifyOtp: async () => mode === "pending-token"
        ? ({ data: { session: null, user: null }, error: null })
        : ({ data: { session, user: session.user }, error: null }),
    };
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${origin}/settings`);
  await page.getByLabel("New password", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Current login email").inputValue(), "old@example.com");
  const passwordForm = page.locator("form").first();
  await passwordForm.getByLabel("Current password").fill("test-old-password");
  await page.getByLabel("New password", { exact: true }).fill("test-new-password");
  await page.getByLabel("Confirm new password").fill("test-other-password");
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await page.getByText("Passwords do not match", { exact: true }).waitFor();
  assert.equal(payloads.length, 0);
  await page.getByLabel("Confirm new password").fill("test-new-password");
  rejectPassword = true;
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await page.getByText("Current password is incorrect", { exact: true }).waitFor();
  rejectPassword = false;
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await page.getByText("Your password has been changed.", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("New password", { exact: true }).inputValue(), "");
  await page.getByLabel("New login email").fill("new@example.com");
  await page.locator("form").last().getByLabel("Current password").fill("test-old-password");
  await page.getByRole("button", { name: "Send approval email" }).click();
  await page.getByText(/Pending login email: new@example.com/).waitFor();
  assert.equal(await page.getByLabel("Current login email").inputValue(), "old@example.com");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);

  await page.getByText(/Approve the link sent to your current email address/).waitFor();
  const approvalUrl = `${origin}/auth/email-change#request_id=22222222-2222-4222-8222-222222222222&approval_token=${"a".repeat(64)}`;
  await mkdir("output/email-change", { recursive: true });
  let releaseInspection;
  const inspectionGate = new Promise((resolve) => { releaseInspection = resolve; });
  await page.route("**/api/account/email-change", async (route) => { await inspectionGate; await route.continue(); }, { times: 1 });
  await page.goto(approvalUrl, { waitUntil: "domcontentloaded" });
  await page.getByText("Securely checking your request…").waitFor();
  await page.screenshot({ path: "output/email-change/loading-mobile.png", fullPage: true });
  assert.equal(new URL(page.url()).hash, "");
  releaseInspection();
  await page.getByRole("button", { name: "Confirm email change" }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  await page.screenshot({ path: "output/email-change/approval-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1100, height: 1000 });
  await page.screenshot({ path: "output/email-change/approval-desktop.png", fullPage: true });
  assert.equal(new URL(page.url()).hash, "");
  assert.equal(approvalConfirms, 0); // Inspection must never approve automatically.
  await page.evaluate(() => { window.rejectSignOut = true; });
  await page.getByRole("button", { name: "Confirm email change" }).click();
  await page.getByText(/Your email was updated, but we could not sign you out/).waitFor();
  assert.equal(new URL(page.url()).pathname, "/auth/email-change");
  assert.equal(approvalConfirms, 1);
  await page.evaluate(() => { window.rejectSignOut = false; });
  await page.getByRole("button", { name: "Sign out and continue" }).click();
  await page.waitForURL("**/login?reauth=email-change");
  assert.equal(await page.evaluate(() => window.signOutCalls), 2);
  assert.equal(await page.evaluate(() => window.signOutScope), "local");
  assert.equal(approvalConfirms, 1); // A logout retry must never repeat the Auth email update.
  assert.equal(new URL(page.url()).searchParams.has("email"), false);
  await page.goto(approvalUrl);
  await page.getByText(/This email change has completed/).waitFor();
  assert.equal(await page.getByRole("button", { name: "Confirm email change" }).count(), 0);
  assert.equal(approvalConfirms, 1);
  await page.getByRole("button", { name: "Sign out and continue" }).click();
  await page.waitForURL("**/login?reauth=email-change");
  assert.equal(await page.evaluate(() => window.signOutCalls), 1);
  assert.equal(approvalConfirms, 1);
  await page.goto(`${origin}/auth/email-change#approval_token=invalid`);
  await page.getByText(/This link is unavailable/).waitFor();
  assert.equal(new URL(page.url()).hash, "");
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  pendingEmail = "new@example.com"; currentEmail = "old@example.com"; verificationMode = "native";
  const pendingMessage = "Confirmation link accepted. Please proceed to confirm link sent to the other email";
  for (const separator of ["?", "#"]) {
    const before = securityReads;
    await page.goto(`${origin}/auth/confirm${separator}message=${encodeURIComponent(pendingMessage)}`);
    await page.getByText(/Your email change is still pending/).waitFor();
    assert.equal(new URL(page.url()).pathname, "/settings");
    assert.equal(new URL(page.url()).search, "");
    assert.equal(new URL(page.url()).hash, "");
    assert.equal(securityReads - before, 1);
    assert.equal(await page.getByText(/updated successfully/).count(), 0);
    assert.equal(await page.getByLabel("Current login email").inputValue(), "old@example.com");
  }
  await page.goto(`${origin}/auth/confirm?token_hash=synthetic-token&type=email_change&testCallback=pending-token`);
  await page.getByText(/Your email change is still pending/).waitFor();

  pendingEmail = null;
  currentEmail = "new@example.com";
  await page.goto(`${origin}/auth/confirm?code=synthetic-code&testCallback=completed`);
  await page.getByText(/Your login email has been updated successfully/).waitFor();
  assert.equal(await page.getByLabel("Current login email").inputValue(), "new@example.com");
  assert.equal(new URL(page.url()).search, "");
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  await page.reload();
  await page.getByLabel("Current login email").waitFor();
  assert.equal(await page.getByText(/updated successfully/).count(), 0);

  await page.goto(`${origin}/settings?emailConfirmation=verified`);
  await page.getByLabel("Current login email").waitFor();
  assert.equal(await page.getByText(/updated successfully/).count(), 0);
  assert.equal(new URL(page.url()).search, "");

  currentEmail = "old@example.com";
  await page.goto(`${origin}/auth/confirm?code=synthetic-code&testCallback=unconsumed`);
  await page.getByText(/We could not establish/).waitFor();
  await page.goto(`${origin}/auth/confirm?code=synthetic-code&testCallback=completed`);
  await page.getByText(/We could not establish/).waitFor();
  assert.equal(await page.getByText(/updated successfully/).count(), 0);
  await page.goto(`${origin}/auth/confirm?token_hash=synthetic-token&type=recovery`);
  await page.getByText(/We could not establish/).waitFor();
  assert.equal(await page.getByText(/updated successfully/).count(), 0);

  for (const path of [
    "/auth/confirm#error_description=Link+expired",
    "/auth/confirm?code=synthetic-code&testCallback=invalid",
  ]) {
    await page.goto(`${origin}${path}`);
    await page.getByText(/The link may be expired, invalid, or already used/).waitFor();
    assert.equal(new URL(page.url()).pathname, "/auth/confirm");
    assert.equal(new URL(page.url()).search, "");
    assert.equal(new URL(page.url()).hash, "");
  }
  rejectLoad = true;
  await page.goto(`${origin}/auth/confirm?code=synthetic-code&testCallback=completed`);
  await page.getByText("Unable to load account details", { exact: true }).waitFor();
  assert.equal(await page.getByText(/updated successfully/).count(), 0);
  assert.deepEqual(errors, []);
  console.log("PASS: current-inbox approval, explicit confirmation, same-tab invalid link, completed replay; existing password/email forms; pending query/fragment/token-hash callbacks; completed confirmation; authoritative state mismatch; one-use feedback; forged hint rejected; unconsumed PKCE code; expired/reused link guidance; URL cleanup; lookup failure; one existing API read per redirect; no persistent storage or browser errors");
} catch (error) {
  console.error("Browser errors:", errors, "Page:", await page?.locator("body").innerText());
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
