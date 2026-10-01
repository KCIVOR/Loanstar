import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.LOANSTAR_BASE_URL ?? "http://localhost:3000";
const outputDir = path.resolve("output/manual-screenshots");

const captures = [
  ["csa-intake", "CSA", "/csa"],
  ["committee-review", "Committee", "/committee"],
  ["collector-accounts", "Collector", "/collector/accounts"],
  ["cig-verification", "CIG", "/cig"],
  ["lra-release", "LRA", "/lra"],
  ["ar-masterlist", "AR", "/ar"],
  ["remedial-accounts", "Remedial", "/remedial"],
  ["admin", "Super Admin", "/admin"],
  ["agent-leads", "Agent", "/agent"],
  ["borrower-portal", "Borrower", "/borrower"],
];

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });

try {
  for (const [name, role, route] of captures) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: role, exact: true }).click();
    // Quick login starts an asynchronous Supabase sign-in. Wait for it to
    // leave the login route before navigating to the requested role module.
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
    await page.waitForLoadState("networkidle");
    await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });

    // Screenshots document the correct module while obscuring list-row data.
    await page.addStyleTag({
      content: "table tbody, [data-private-record] { filter: blur(8px); }",
    });
    await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: false });
    console.log(`Captured ${name}: ${await page.title()} (${page.url()})`);
    await context.close();
  }
} finally {
  await browser.close();
}
