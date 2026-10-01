import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const email = process.env.LOANSTAR_BORROWER_EMAIL;
const password = process.env.LOANSTAR_BORROWER_PASSWORD;
const baseUrl = process.env.LOANSTAR_BASE_URL ?? "http://localhost:3000";

if (!email || !password) throw new Error("Borrower credentials were not supplied to the screenshot runner.");

const outputPath = path.resolve("output/manual-screenshots/borrower-portal-account-redacted.png");
await fs.mkdir(path.dirname(outputPath), { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  console.log("Opening borrower sign in");
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.getByRole("textbox", { name: "Email or borrower ID *", exact: true }).fill(email);
  await page.getByRole("textbox", { name: "Password *", exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
  console.log("Opening borrower portal");
  await page.goto(`${baseUrl}/borrower`, { waitUntil: "domcontentloaded", timeout: 15_000 });
  const href = await page.locator('a[href^="/borrower/applications/"]').evaluateAll((els) =>
    els.map((el) => el.getAttribute("href")).find((value) => value && value !== "/borrower/applications/new"),
  );
  if (!href) {
    // The deployed account has no application to open. Capture the actual
    // borrower portal while suppressing account-specific display text.
    await page.addStyleTag({ content: `
      main h1, header button, [role="banner"] button, [data-private-record], table tbody { filter: blur(8px); }
    ` });
    await page.screenshot({ path: outputPath, fullPage: false });
    console.log(`Captured redacted borrower portal screenshot: ${outputPath}`);
    await context.close();
    process.exit(0);
  }
  console.log("Opening borrower application");
  await page.goto(`${baseUrl}${href}`, { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.getByRole("button", { name: "Edit application form", exact: true }).click();
  await page.getByRole("heading", { name: "Application Form", exact: true }).last().waitFor({ state: "visible" });

  // Retain field labels and controls while preventing account-specific values
  // from being published into the end-user manual.
  await page.addStyleTag({ content: `
    input, textarea, [contenteditable="true"] { color: transparent !important; text-shadow: 0 0 8px #667085 !important; }
    input::placeholder, textarea::placeholder { color: #667085 !important; text-shadow: none !important; }
  ` });
  await page.getByRole("heading", { name: "Application Form", exact: true }).last().scrollIntoViewIfNeeded();
  await page.screenshot({ path: outputPath, fullPage: false });
  console.log(`Captured redacted borrower form screenshot: ${outputPath}`);
  await context.close();
} finally {
  await browser.close();
}
