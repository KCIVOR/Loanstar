import assert from "node:assert/strict";
import test from "node:test";
import { isSafeWebsiteLink, SECTION_ANCHORS } from "../links";
import { websiteSchema } from "../schema";
import { DEFAULT_WEBSITE } from "../default-content";
test("safe destinations and original hero anchor", () => {
  assert.equal(SECTION_ANCHORS.hero, "top");
  for (const link of [
    "/",
    "/login",
    "/register",
    "#top",
    "https://example.com/policy",
  ])
    assert.ok(isSafeWebsiteLink(link));
  for (const link of [
    "javascript:alert(1)",
    "//evil.test",
    "/api/admin",
    "data:text/html,a",
    "https://user:pass@example.com",
    "https://example.com\\evil",
  ])
    assert.equal(isSafeWebsiteLink(link), false);
});
test("hidden sections cannot leave dead anchors", () => {
  const value = structuredClone(DEFAULT_WEBSITE);
  const products = value.landing.sections.find((s) => s.id === "products");
  assert.ok(products);
  products.enabled = false;
  assert.equal(websiteSchema.safeParse(value).success, false);
});
