import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { parseEnv } from "node:util";
import { websiteSchema } from "../src/lib/website/schema";
import sharp from "sharp";

test("staging CMS saves, previews, publishes all three pages and restores the original release", async ({ page, browser, baseURL }) => {
  test.setTimeout(180000);
  const email = process.env.E2E_CMS_EMAIL;
  const password = process.env.E2E_CMS_PASSWORD;
  test.skip(!email || !password, "Dedicated staging Super Admin credentials required");
  const env = parseEnv(fs.readFileSync(".env.development.local", "utf8"));
  expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://ddsvqjaknuniekygpbdr.supabase.co");
  const origin = new URL(baseURL!).origin;
  const headers = { Origin: origin };
  await page.goto("/login");
  await expect(page.locator("form")).toHaveAttribute("data-website-hydrated", "true");
  await page.locator("#email").fill(email!);
  await page.locator("#password").fill(password!);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  const state = async () => {
    const response = await page.request.get("/api/admin/website");
    expect(response.ok(), `CMS state HTTP ${response.status()}`).toBeTruthy();
    return response.json();
  };
  const mutate = async (path: string, body: unknown, method: "POST" | "PUT" = "POST") => {
    const response = await page.request.fetch(`/api/admin/website${path}`, { method, headers, data: body });
    expect(response.ok(), `${path} HTTP ${response.status()}: ${await response.text()}`).toBeTruthy();
    return response.json();
  };
  let initial = await state();
  expect(initial.draft.base_revision_id).toBe(initial.publication.revision_id);
  const originalDraft = websiteSchema.parse(initial.draft.content);
  const invalidOrigin = await page.request.put('/api/admin/website/draft', { headers: { Origin: 'https://foreign.example' }, data: { expectedVersion: initial.draft.lock_version, content: originalDraft } });
  expect(invalidOrigin.status()).toBe(403);
  const race = await Promise.all([1, 2].map(() => page.request.put('/api/admin/website/draft', {
    headers, data: { expectedVersion: initial.draft.lock_version, content: originalDraft }
  })));
  console.log('Concurrent draft results:', JSON.stringify(await Promise.all(race.map(async response => ({ status: response.status(), error: response.ok() ? undefined : (await response.json()).error })))));
  expect(race.map(response => response.status()).sort()).toEqual([200, 409]);
  initial = await state();
  const fixture = structuredClone(originalDraft);
  const image = await sharp({ create: { width: 16, height: 16, channels: 4, background: { r: 0, g: 100, b: 100, alpha: 1 } } }).png().toBuffer();
  const uploaded = await page.request.post('/api/admin/website/assets', { headers, multipart: { file: { name: 'cms-verification.png', mimeType: 'image/png', buffer: image } } });
  expect(uploaded.ok(), `Upload HTTP ${uploaded.status()}: ${await uploaded.text()}`).toBeTruthy();
  const uploadedAsset = (await uploaded.json()).asset;
  fixture.site.logoAssetId = uploadedAsset.id;
  console.log(`Retained synthetic CMS asset: ${uploadedAsset.id}`);
  const hero = fixture.landing.sections.find(section => section.type === "hero")!;
  hero.title = "CMS verification, charted clearly";
  fixture.login.greeting = "CMS login verification";
  fixture.register.greeting = "CMS registration verification";
  let publishedId: string | null = null;
  let savedVersion: number | null = null;
  try {
    const saved = await mutate("/draft", { expectedVersion: initial.draft.lock_version, content: fixture }, "PUT");
    savedVersion = saved.draft.lock_version;
    const draftState = await state();
    expect(draftState.publication.revision_id).toBe(initial.publication.revision_id);
    for (const [name, heading] of [["landing", hero.title], ["login", fixture.login.greeting], ["register", fixture.register.greeting]]) {
      await page.goto(`/website-preview/${name}`);
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      if (name !== 'landing') await expect(page.locator("#password")).toBeDisabled();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    }
    const publicationRace = await Promise.allSettled([1, 2].map(() => page.request.post('/api/admin/website/publish', {
      headers, data: {
        expectedVersion: savedVersion, expectedPublishedRevisionId: initial.publication.revision_id,
        requestId: crypto.randomUUID(), summary: "Reversible local CMS integration verification",
      }
    })));
    const fulfilled = publicationRace.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    const winner = fulfilled.find(response => response.ok());
    if (winner) publishedId = (await winner.json()).revision.id;
    expect(fulfilled.map(response => response.status()).sort()).toEqual([200, 409]);
    expect(publishedId).not.toBeNull();
    const anonymous = await browser.newContext();
    try {
      const visitor = await anonymous.newPage();
      expect((await anonymous.request.get(`${origin}/api/admin/website`)).status()).toBe(401);
      for (const [path, heading] of [["/", hero.title], ["/login", fixture.login.greeting], ["/register", fixture.register.greeting]]) {
        await visitor.goto(new URL(path, origin).href);
        await expect(visitor.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      }
      await visitor.setViewportSize({ width: 390, height: 844 });
      await visitor.goto(`${origin}/register`);
      await expect(visitor.locator("#firstName")).toBeVisible();
      await expect(visitor.locator(".login-brand")).not.toBeVisible();
    } finally { await anonymous.close(); }
  } finally {
    const current = await state();
    if (publishedId) {
      // Do not overwrite a release created concurrently by someone else.
      expect(current.publication.revision_id).toBe(publishedId);
      const ownDraft = current.draft.lock_version === savedVersion! + 1 &&
        JSON.stringify(websiteSchema.parse(current.draft.content)) === JSON.stringify(websiteSchema.parse(fixture));
      await mutate("/restore", {
        targetRevisionId: initial.publication.revision_id,
        expectedVersion: current.draft.lock_version,
        expectedPublishedRevisionId: publishedId, requestId: crypto.randomUUID(),
      });
      const restored = await state();
      if (ownDraft) {
        const reset = await mutate("/draft/reconcile", {
          mode: "reset", expectedVersion: restored.draft.lock_version,
          expectedPublishedRevisionId: restored.publication.revision_id,
        });
        if (JSON.stringify(websiteSchema.parse(reset.draft.content)) !== JSON.stringify(originalDraft)) {
          await mutate("/draft", { expectedVersion: reset.draft.lock_version, content: originalDraft }, "PUT");
        }
      } else {
        console.warn('A concurrent draft was preserved; explicit reconciliation remains required.');
      }
      expect(websiteSchema.parse((await state()).publication.public_content.content)).toEqual(websiteSchema.parse(initial.publication.public_content.content));
    } else if (savedVersion !== null) {
      expect(current.draft.lock_version).toBe(savedVersion);
      await mutate("/draft", { expectedVersion: savedVersion, content: originalDraft }, "PUT");
    }
  }
  await page.goto("/admin/website");
  await expect(page.getByRole("tab", { name: "Register", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/website-cms-admin.png", fullPage: true });
});
