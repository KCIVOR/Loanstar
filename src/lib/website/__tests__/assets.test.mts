import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { normalizeWebsiteImage } from '../assets-core';

test('decoded image normalization produces bounded immutable PNG identity', async () => {
  const input = await sharp({ create: { width: 10, height: 12, channels: 4, background: '#ffffff' } }).png().toBuffer();
  const normalized = await normalizeWebsiteImage(input);
  assert.equal(normalized.width, 10);
  assert.equal(normalized.height, 12);
  assert.equal(normalized.mimeType, 'image/png');
  assert.match(normalized.checksum, /^[a-f0-9]{64}$/);
});

test('corrupt, oversized and SVG inputs are rejected', async () => {
  for (const bytes of [Buffer.from('not an image'), Buffer.alloc(5242881), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>')]) {
    await assert.rejects(() => normalizeWebsiteImage(bytes));
  }
});
