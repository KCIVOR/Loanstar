import { expect, test } from "@playwright/test";

// The request is intercepted locally. These tests never create a Supabase user
// or send a confirmation email.
async function fillRequiredRegistration(page: import("@playwright/test").Page) {
  await expect(page.locator("form")).toHaveAttribute("data-website-hydrated", "true");
  await page.locator("#firstName").fill("CMS");
  await page.locator("#lastName").fill("Fixture");
  await page.locator("#email").fill("cms-fixture@example.invalid");
  await page.locator("#password").fill("FixtureOnly2026!");
}

for (const confirmationSent of [true, false]) {
  test(`registration preserves the request and confirmationSent=${confirmationSent} result`, async ({ page }) => {
    let received = 0;
    let signInRequests = 0;
    page.on("request", request => {
      if (request.url().includes("/auth/v1/token")) signInRequests++;
    });
    await page.route("**/api/borrower/register", async route => {
      received++;
      expect(route.request().method()).toBe("POST");
      expect(route.request().postDataJSON()).toEqual({
        firstName: "CMS",
        lastName: "Fixture",
        email: "cms-fixture@example.invalid",
        password: "FixtureOnly2026!",
      });
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          confirmationSent,
          requiresEmailConfirmation: confirmationSent,
        }),
      });
    });
    await page.goto("/register");
    await fillRequiredRegistration(page);
    await expect(page.locator("#password")).toHaveAttribute("minlength", "8");
    await expect(page.locator("#password")).toHaveAttribute("autocomplete", "new-password");
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await expect(page.getByText(confirmationSent ? /We sent a confirmation link/ : /Your account has been created/)).toBeVisible();
    expect(received).toBe(1);
    expect(signInRequests).toBe(0);
    await expect(page).toHaveURL(/\/register$/);
    await page.getByRole("button", { name: "Go to log in", exact: true }).click();
    await expect(page).toHaveURL(/\/login\?redirect=\/borrower$/);
  });
}

test("registration keeps optional fields and civil-status values", async ({ page }) => {
  await page.route("**/api/borrower/register", async route => {
    expect(route.request().postDataJSON()).toMatchObject({
      middleName: "Test",
      dateOfBirth: "1990-01-02",
      civilStatus: "Married",
    });
    await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "An account with this email already exists." }) });
  });
  await page.goto("/register");
  await fillRequiredRegistration(page);
  await expect(page.locator("#civilStatus option")).toHaveText([
    "Select", "Single", "Married", "Widowed", "Separated", "Annulled", "Legally Separated",
  ]);
  await page.locator("#middleName").fill("Test");
  await page.locator("#dateOfBirth").fill("1990-01-02");
  await page.locator("#civilStatus").selectOption("Married");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByText("An account with this email already exists.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await expect(page.locator("#email")).toHaveValue("cms-fixture@example.invalid");
});

test("login keeps credential attributes and fixed recovery destination", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("form")).toHaveAttribute("data-website-hydrated", "true");
  await expect(page.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();
  await expect(page.locator("#email")).toHaveAttribute("autocomplete", "username");
  await expect(page.locator("#password")).toHaveAttribute("autocomplete", "current-password");
  await expect(page.getByRole("link", { name: "Forgot password?", exact: true })).toHaveAttribute("href", "/forgot-password");
  await page.getByRole("button", { name: "Show password", exact: true }).click();
  await expect(page.locator("#password")).toHaveAttribute("type", "text");
});

test("legacy registration URLs preserve their destination", async ({ page }) => {
  for (const alias of ["/signup", "/borrower/register"]) {
    await page.goto(alias);
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  }
});
