import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.LOANSTAR_BASE_URL ?? "http://localhost:3000";
const outputDir = path.resolve("output/manual-screenshots");

const captures = [
  ["login", null, "/login"],
  ["account", "Super Admin", "/account"],
  ["dashboard", "Super Admin", "/dashboard"],
  ["collector-dcrr", "Collector", "/collector/dcr"],
  ["admin-config", "Super Admin", "/admin/config"],
  ["admin-checklists", "Super Admin", "/admin/checklists"],
  ["admin-document-templates", "Super Admin", "/admin/document-templates"],
  ["admin-audit", "Super Admin", "/admin/audit"],
  ["admin-legacy-import", "Super Admin", "/admin/legacy-import"],
  ["reports", "Super Admin", "/reports"],
].filter(([name]) => {
  const wanted = process.env.MANUAL_CAPTURE_NAMES;
  return !wanted || wanted.split(",").includes(name);
});

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });

async function signIn(page, role) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.getByRole("button", { name: role, exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 30_000,
    waitUntil: "commit",
  });
}

try {
  for (const [name, role, route] of captures) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    try {
      if (role) await signIn(page, role);
      await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(1_500);
      await page.addStyleTag({
        content: "table tbody, [data-private-record] { filter: blur(9px) !important; }",
      });
      await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: false });
      console.log(`Captured ${name}: ${page.url()}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
