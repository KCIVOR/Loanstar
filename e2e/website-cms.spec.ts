import { test, expect } from "@playwright/test";
import { DEFAULT_WEBSITE } from "../src/lib/website/default-content";

const email = process.env.E2E_CMS_EMAIL;
const password = process.env.E2E_CMS_PASSWORD;

test.describe("Website Content editor", () => {
  test.skip(
    !email || !password,
    "Set dedicated staging Super Admin E2E_CMS_EMAIL and E2E_CMS_PASSWORD",
  );

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("form")).toHaveAttribute("data-website-hydrated", "true");
    await page.locator("#email").fill(email!);
    await page.locator("#password").fill(password!);
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await page.waitForURL(/\/dashboard/);
  });

  test("draft save and whole-site publication use expected versions", async ({
    page,
  }) => {
    let draft = {
      content: structuredClone(DEFAULT_WEBSITE),
      lock_version: 3,
      base_revision_id: "11111111-1111-4111-8111-111111111111",
    };
    const publication = {
      revision_id: draft.base_revision_id,
      published_at: "2026-10-29T00:00:00Z",
      public_content: { content: structuredClone(DEFAULT_WEBSITE), assets: [] },
    };
    let publishCount = 0;
    await page.route("**/api/admin/website", (route) =>
      route.fulfill({
        json: {
          draft,
          publication,
          capabilities: { canEdit: true, canPublish: true },
        },
      }),
    );
    await page.route("**/api/admin/website/draft", async (route) => {
      const body = route.request().postDataJSON();
      expect(body.expectedVersion).toBe(3);
      expect(body.content.register.greeting).toBe("Join our portal");
      draft = { ...draft, content: body.content, lock_version: 4 };
      await route.fulfill({ json: { draft } });
    });
    await page.route("**/api/admin/website/publish", async (route) => {
      const body = route.request().postDataJSON();
      expect(body.expectedVersion).toBe(4);
      expect(body.expectedPublishedRevisionId).toBe(publication.revision_id);
      expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
      expect(body).not.toHaveProperty("page");
      publishCount++;
      await route.fulfill({
        json: {
          revision: {
            id: "22222222-2222-4222-8222-222222222222",
            revision_no: 2,
          },
        },
      });
    });
    await page.goto("/admin/website");
    await page.getByRole("tab", { name: "Register", exact: true }).click();
    await page.getByLabel("Greeting", { exact: true }).fill("Join our portal");
    await expect(
      page.getByRole("button", {
        name: "Publish all three pages",
        exact: true,
      }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(
      page.getByText("Draft saved. The published website has not changed."),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Publish all three pages", exact: true })
      .click();
    await expect(
      page.getByText(
        "Landing, login, registration and shared public branding will switch together.",
      ),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Publish all three pages", exact: true })
      .last()
      .click();
    await expect(
      page.getByText(
        "Landing, login, registration and branding were published together.",
      ),
    ).toBeVisible();
    expect(publishCount).toBe(1);
  });

  test("footer destination can return to label-only without losing input focus", async ({
    page,
  }) => {
    const draft = {
      content: structuredClone(DEFAULT_WEBSITE),
      lock_version: 3,
      base_revision_id: "11111111-1111-4111-8111-111111111111",
    };
    await page.route("**/api/admin/website", (route) =>
      route.fulfill({
        json: {
          draft,
          publication: {
            revision_id: draft.base_revision_id,
            published_at: "2026-10-29T00:00:00Z",
          },
          capabilities: { canEdit: true, canPublish: true },
        },
      }),
    );
    await page.goto("/admin/website");
    const destination = page
      .getByLabel("Href (optional)", { exact: true })
      .last();
    await destination.fill("https://example.com/legal");
    await expect(destination).toHaveValue("https://example.com/legal");
    await expect(destination).toBeFocused();
    await destination.fill("");
    await expect(destination).toHaveValue("");
    await expect(
      page.getByRole("button", { name: "Save draft", exact: true }),
    ).toBeDisabled();
  });

  test("conflicting save preserves local input and does not publish", async ({
    page,
  }) => {
    const draft = {
      content: structuredClone(DEFAULT_WEBSITE),
      lock_version: 3,
      base_revision_id: "11111111-1111-4111-8111-111111111111",
    };
    await page.route("**/api/admin/website", (route) =>
      route.fulfill({
        json: {
          draft,
          publication: {
            revision_id: draft.base_revision_id,
            published_at: "2026-10-29T00:00:00Z",
          },
          capabilities: { canEdit: true, canPublish: true },
        },
      }),
    );
    await page.route("**/api/admin/website/draft", (route) =>
      route.fulfill({
        status: 409,
        json: { error: "Draft changed in another tab" },
      }),
    );
    await page.goto("/admin/website");
    await page.getByRole("tab", { name: "Login", exact: true }).click();
    await page
      .getByLabel("Greeting", { exact: true })
      .fill("Retain this unsaved greeting");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByText("Draft changed in another tab")).toBeVisible();
    await expect(page.getByLabel("Greeting", { exact: true })).toHaveValue(
      "Retain this unsaved greeting",
    );
    await expect(
      page.getByRole("button", {
        name: "Publish all three pages",
        exact: true,
      }),
    ).toBeDisabled();
  });
});
