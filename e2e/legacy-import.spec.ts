import { test, expect } from "@playwright/test";
import path from "node:path";
import { validateRows } from "../src/lib/legacy-import/validate";

test("legacy workbook reaches confirmation and displays a save result without repeating submission", async ({ page }) => {
  test.skip(process.env.RUN_LEGACY_IMPORT_UI_TEST !== "true", "Opt-in local seed-admin test; save is intercepted, no loan is created");
  test.setTimeout(90_000);
  await page.goto("/login");
  await page.getByRole("button", { name: "Super Admin", exact: true }).click();
  await expect(page).toHaveURL(/\/(dashboard|admin)/, { timeout: 30_000 });
  await page.route("**/api/admin/legacy-import/runs", (route) => route.fulfill({ json: { run: { id: "ui-test" } } }));
  await page.route("**/api/admin/legacy-import/validate", route => {
    const input = route.request().postDataJSON();
    return route.fulfill({ json: { results: validateRows(input.rows, input.mapping, input.segment) } });
  });
  let writes = 0;
  await page.route("**/api/admin/legacy-import/import", async (route) => {
    writes++;
    const input = route.request().postDataJSON();
    expect(input.rows).toHaveLength(1);
    expect(input.installments).toHaveLength(13);
    await route.fulfill({ json: { outcomes: [{ rowNumber: 2, loanNo: "TEST-SF-20261005-001",
      status: "imported", message: "Imported successfully", masterlistId: "ui-test-only" }] } });
  });
  await page.goto("/admin/legacy-import");
  await page.locator('input[type="file"]').setInputFiles(path.resolve("outputs/legacy-import-dummy-data-20261005/legacy-masterlist-dummy-seafarer.xlsx"));
  await page.getByRole("button", { name: /Continue to mapping/ }).click();
  await page.getByRole("button", { name: /Validate & review/ }).click();
  await page.getByRole("button", { name: /Continue to import/ }).click();
  const save = page.getByRole("button", { name: "Import 1 row(s)", exact: true });
  await expect(save).toBeEnabled();
  page.once("dialog", (dialog) => dialog.accept());
  await save.click();
  await expect(page.getByText("Imported successfully", { exact: true })).toBeVisible();
  await expect(save).toBeDisabled();
  await expect(page.getByRole("button", { name: /Download import results/ })).toBeVisible();
  expect(writes).toBe(1);
});

test("three-case dummy validates and Masterlist exposes Imported source filtering", async ({ page }) => {
  test.skip(process.env.RUN_LEGACY_IMPORT_UI_TEST !== "true", "Opt-in local seed-admin test; no loan writes");
  test.setTimeout(90_000);
  await page.goto("/login");
  await page.getByRole("button", { name: "Super Admin", exact: true }).click();
  await expect(page).toHaveURL(/\/(dashboard|admin)/, { timeout: 30_000 });
  await page.route("**/api/admin/legacy-import/runs", route => route.fulfill({ json: { run: { id: "ui-three-test" } } }));
  await page.route("**/api/admin/legacy-import/validate", route => {
    const input = route.request().postDataJSON();
    return route.fulfill({ json: { results: validateRows(input.rows, input.mapping, input.segment) } });
  });
  await page.route("**/api/admin/legacy-import/import", route => route.abort());
  await page.goto("/admin/legacy-import");
  await page.locator('input[type="file"]').setInputFiles(path.resolve("outputs/legacy-import-dummy-data-20261007/legacy-masterlist-dummy-seafarer.xlsx"));
  await page.getByRole("button", { name: /Continue to mapping/ }).click();
  await page.getByRole("button", { name: /Validate & review/ }).click();
  await page.getByRole("button", { name: /Continue to import/ }).click();
  await expect(page.getByRole("button", { name: "Import 3 row(s)", exact: true })).toBeEnabled();

  const sources: string[] = [];
  await page.route("**/api/ar/masterlist?*", route => {
    const source = new URL(route.request().url()).searchParams.get("source") ?? "all";
    sources.push(source);
    const imported = { id: "test-paid", loan_account_no: "TEST-SF-20261007-002", borrower_name: "Test Paid", borrower_no: "TEST-B-PAID", outstanding_balance: 0, monthly_amortization: 10000, aging_bucket: "current", account_status: "paid", segment: "seafarer", is_legacy_import: true };
    return route.fulfill({ json: { rows: source === "system" ? [] : [imported], totalCount: source === "system" ? 0 : 1, kpi: { total: 1, activeCount: 0, attentionCount: 0, totalOutstanding: 0 } } });
  });
  await page.goto("/ar");
  await expect(page.locator(".badge").getByText("Imported", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Filters/ }).click();
  const group = page.locator(".filter-group").filter({ has: page.getByText("Source", { exact: true }) });
  await group.getByRole("button", { name: "Imported", exact: true }).click();
  await expect.poll(() => sources.at(-1)).toBe("imported");
  await group.getByRole("button", { name: "System-created", exact: true }).click();
  await expect.poll(() => sources.at(-1)).toBe("system");
  await page.getByRole("button", { name: "Clear source filter" }).click();
  await expect.poll(() => sources.at(-1)).toBe("all");
  await page.route("**/api/ar/masterlist/test-paid", route => route.fulfill({ json: {
    record: { id: "test-paid", borrower_name: "Test Paid", borrower_no: "TEST-B-PAID", loan_account_no: "TEST-SF-20261007-002",
      is_legacy_import: true, account_status: "paid", application_status: "paid_off", segment: "seafarer", aging_bucket: "current",
      total_loan: 120000, principal: 100000, outstanding_balance: 0, monthly_amortization: 10000, terms: 12,
      amortization_schedules: [], assignments: [], portfolios: null }, payments: [], postings: []
  } }));
  await page.goto("/ar/masterlist/test-paid");
  await expect(page.locator(".badge").getByText("Imported", { exact: true })).toBeVisible();
  await expect(page.getByText(/This loan was fully paid before import/)).toBeVisible();
});
