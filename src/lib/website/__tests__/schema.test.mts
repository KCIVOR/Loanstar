import assert from "node:assert/strict";
import test from "node:test";
import {
  websiteSchema,
  publicationSchema,
  publicAssetSchema,
  collectAssetIds,
} from "../schema";
import { DEFAULT_WEBSITE } from "../default-content";

test("schema normalization removes JSONB object-order differences", () => {
  const reorder = (value: unknown): unknown => Array.isArray(value)
    ? value.map(reorder)
    : value !== null && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reorder(item)]))
      : value;
  assert.notEqual(JSON.stringify(reorder(DEFAULT_WEBSITE)), JSON.stringify(DEFAULT_WEBSITE));
  assert.equal(JSON.stringify(websiteSchema.parse(reorder(DEFAULT_WEBSITE))), JSON.stringify(websiteSchema.parse(DEFAULT_WEBSITE)));
});
test("baseline is a valid complete three-page release", () => {
  const value = websiteSchema.parse(DEFAULT_WEBSITE);
  assert.ok(value.landing && value.login && value.register);
  assert.deepEqual(collectAssetIds(value), []);
  assert.equal(
    publicationSchema.safeParse({ content: value, assets: [] }).success,
    true,
  );
});
test("registration cannot be removed or configure behavior", () => {
  const { register, ...partial } = DEFAULT_WEBSITE;
  assert.ok(register);
  assert.equal(websiteSchema.safeParse(partial).success, false);
  assert.equal(
    websiteSchema.safeParse({
      ...DEFAULT_WEBSITE,
      register: { ...register, submitUrl: "https://bad.example" },
    }).success,
    false,
  );
});
test("hero mandatory first and enabled, sections unique", () => {
  for (const sections of [
    [...DEFAULT_WEBSITE.landing.sections].reverse(),
    [{ ...DEFAULT_WEBSITE.landing.sections[0], enabled: false }],
    [...DEFAULT_WEBSITE.landing.sections, DEFAULT_WEBSITE.landing.sections[0]],
  ])
    assert.equal(
      websiteSchema.safeParse({
        ...DEFAULT_WEBSITE,
        landing: { ...DEFAULT_WEBSITE.landing, sections },
      }).success,
      false,
    );
});
test("duplicate footer and statement IDs rejected", () => {
  const value = structuredClone(DEFAULT_WEBSITE);
  value.landing.footer.columns.push(value.landing.footer.columns[0]);
  assert.equal(websiteSchema.safeParse(value).success, false);
  const other = structuredClone(DEFAULT_WEBSITE);
  const benefits = other.landing.sections.find((s) => s.type === "benefits");
  assert.ok(benefits && benefits.type === "benefits");
  benefits.statement.push(benefits.statement[0]);
  assert.equal(websiteSchema.safeParse(other).success, false);
});
test("manifest validates image area, identity and mime", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const asset = {
    id,
    publicPath: `${id}/${"a".repeat(64)}.png`,
    mimeType: "image/png",
    width: 100,
    height: 100,
  };
  assert.equal(publicAssetSchema.safeParse(asset).success, true);
  for (const patch of [
    { width: 5000, height: 5000 },
    { id: "22222222-2222-4222-8222-222222222222" },
    { mimeType: "image/jpeg" },
    { publicPath: `bad/${"a".repeat(64)}.png` },
  ])
    assert.equal(
      publicAssetSchema.safeParse({ ...asset, ...patch }).success,
      false,
    );
  assert.equal(
    publicationSchema.safeParse({ content: DEFAULT_WEBSITE, assets: [asset] })
      .success,
    false,
  );
});
