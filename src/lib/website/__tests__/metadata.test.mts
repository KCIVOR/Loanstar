import assert from 'node:assert/strict';
import test from 'node:test';
import { websiteMetadata } from '../metadata';
import { DEFAULT_WEBSITE } from '../default-content';
import type { WebsiteSnapshot } from '../public-reader';
test('text branding removes inherited portal icons and selected icon uses release manifest', () => {
  const snapshot: WebsiteSnapshot = { origin: 'published', revisionId: 'fixture', content: structuredClone(DEFAULT_WEBSITE), assets: [] };
  assert.deepEqual(websiteMetadata(snapshot, 'register').icons, { icon: [], apple: [], shortcut: [] });
  const id = '11111111-1111-4111-8111-111111111111';
  const publicPath = `${id}/${'a'.repeat(64)}.png`;
  snapshot.content.site.iconAssetId = id;
  snapshot.assets = [{ id, publicPath, mimeType: 'image/png', width: 10, height: 10 }];
  assert.deepEqual(websiteMetadata(snapshot, 'login', 'https://staging.example').icons, { icon: `https://staging.example/storage/v1/object/public/website-public/${publicPath}`, apple: `https://staging.example/storage/v1/object/public/website-public/${publicPath}` });
});
