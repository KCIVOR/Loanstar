import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const html = await readFile("docs/account-email-change-template.html", "utf8");
const sql = await readFile("docs/account-email-change-template.sql", "utf8");
assert.deepEqual([...new Set([...html.matchAll(/\{\{(.*?)\}\}/g)].map((match) => match[1]))].sort(), ["approvalUrl", "newEmail"]);
assert.equal(sql.split("$email_template$")[1], html);
assert.match(sql, /WHERE slug = 'account_email_change_current_approval'/);
assert.doesNotMatch(html, /24 hours|account will be created|\.ConfirmationURL|\.Email/);
assert.match(html, /30 minutes/);
assert.match(html, /signed out/);
assert.match(html, /inbox is not verified/);
const preview = html.replaceAll("{{newEmail}}", "new-address@example.com").replaceAll("{{approvalUrl}}", "https://example.invalid/auth/email-change#synthetic-preview");
await mkdir("output/email-change", { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  for (const width of [390, 900]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.setContent(preview, { waitUntil: "load" });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    assert.equal(await page.getByRole("link", { name: "Review email change", exact: true }).getAttribute("href"), "https://example.invalid/auth/email-change#synthetic-preview");
    await page.screenshot({ path: `output/email-change/template-${width}.png`, fullPage: true });
  }
  console.log("PASS: template placeholders, scoped manual SQL, expiry/security copy, mobile/desktop rendering and approval link");
} finally { await browser.close(); }
