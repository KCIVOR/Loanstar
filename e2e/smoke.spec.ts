import { test, expect } from "@playwright/test";

test.describe("LoanStar smoke", () => {
  test("login page loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  });

  test("borrower registration page loads", async ({ page }) => {
    await page.goto("/borrower/register");
    await expect(page.getByRole("heading")).toBeVisible();
  });
});

test.describe("Happy path (requires seeded staging credentials)", () => {
  test.skip(
    !process.env.E2E_BORROWER_EMAIL,
    "Set E2E_BORROWER_EMAIL and E2E_BORROWER_PASSWORD to run full path",
  );

  test("borrower can sign in and reach dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(process.env.E2E_BORROWER_EMAIL!);
    await page.getByLabel(/password/i).fill(process.env.E2E_BORROWER_PASSWORD!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/borrower/);
  });
});
