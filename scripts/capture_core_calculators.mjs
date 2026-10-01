import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.LOANSTAR_BASE_URL ?? "http://localhost:3000";
const outDir = path.resolve("output/manual-screenshots");
await fs.mkdir(outDir, { recursive: true });

async function login(page, role) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: role, exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
  await page.waitForLoadState("networkidle");
}

async function firstHref(page, selector) {
  const hrefs = await page.locator(selector).evaluateAll((els) =>
    [...new Set(els.map((el) => el.getAttribute("href")).filter((href) => href && !href.endsWith("/new")))],
  );
  if (!hrefs[0]) throw new Error(`No matching link: ${selector}`);
  return hrefs[0];
}

async function capture(role, listRoute, linkSelector, heading, name) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await login(page, role);
    await page.goto(`${baseUrl}${listRoute}`, { waitUntil: "networkidle" });
    const href = await firstHref(page, linkSelector);
    await page.goto(`${baseUrl}${href}`, { waitUntil: "networkidle" });
    if (name === "csa-computation") {
      await page.evaluate(() => window.scrollTo(0, 5000));
    } else {
      const section = page.getByText(heading, { exact: false }).last();
      await section.scrollIntoViewIfNeeded();
    }
    await page.addStyleTag({ content: "table tbody, [data-private-record] { filter: blur(8px); }" });
    await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false });
    console.log(`Captured ${name}: ${page.url()}`);
  } finally {
    await context.close();
  }
}

async function captureCollectorMove() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await login(page, "Collector");
    await page.goto(`${baseUrl}/collector/accounts`, { waitUntil: "networkidle" });
    const accountHref = await firstHref(page, 'a[href^="/collector/accounts/"]');
    const accountId = accountHref.split("/")[3];
    await page.goto(`${baseUrl}/collector/accounts/${accountId}/move-of-payment`, { waitUntil: "networkidle" });
    await page.getByText("Move of payment", { exact: false }).first().scrollIntoViewIfNeeded();
    await page.addStyleTag({ content: "table tbody, [data-private-record] { filter: blur(8px); }" });
    await page.screenshot({ path: path.join(outDir, "collector-move-of-payment.png"), fullPage: false });
    console.log(`Captured collector-move-of-payment: ${page.url()}`);
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({ headless: true });
try {
  await capture("CSA", "/csa", 'a[href^="/csa/applications/"]', "Computation", "csa-computation");
  await capture("Committee", "/committee", 'a[href^="/committee/applications/"]', "Computation", "committee-computation");
  await captureCollectorMove();
} finally {
  await browser.close();
}
