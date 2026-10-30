import assert from 'node:assert/strict';
import test from 'node:test';
import { readWebsiteJson, assertSameOrigin, checkDatabaseError, WebsiteError } from '../errors';

test('same-origin mutation rejects absent/foreign origins', () => {
  for (const origin of [null, 'https://evil.example']) {
    assert.throws(() => assertSameOrigin(new Request('http://localhost:3000/api/admin/website/draft', { method: 'PUT', headers: origin ? { origin } : {} })), WebsiteError);
  }
  assert.doesNotThrow(() => assertSameOrigin(new Request('http://localhost:3000/api/admin/website/draft', { method: 'PUT', headers: { origin: 'http://localhost:3000' } })));
});

test('body limit applies even with missing content-length', async () => {
  await assert.rejects(() => readWebsiteJson(new Request('http://localhost', { method: 'POST', body: 'x'.repeat(262145) })), (e: unknown) => e instanceof WebsiteError && e.status === 413);
  assert.deepEqual(await readWebsiteJson(new Request('http://localhost', { method: 'POST', body: '{"ok":true}' })), { ok: true });
});

test('same-origin uses actual Host while rejecting foreign and forwarded origins', () => {
  const request = (origin: string, host = 'localhost:3000') => new Request('http://0.0.0.0:3000/api/admin/website/draft', {
    method: 'PUT', headers: { origin, host, 'x-forwarded-host': 'evil.example' }
  });
  assert.doesNotThrow(() => assertSameOrigin(request('http://localhost:3000')));
  assert.throws(() => assertSameOrigin(request('http://evil.example')), WebsiteError);
  for (const host of ['localhost:3000@evil.example', 'localhost:3000/path', 'localhost:3000,evil.example']) {
    assert.throws(() => assertSameOrigin(request('http://localhost:3000', host)), WebsiteError);
  }
});

test('native HTTP conflict state maps to409 without masking infrastructure failures', () => {
  for (const code of ['PT409', '40001', '23505']) {
    assert.throws(() => checkDatabaseError({ code }), (error: unknown) => error instanceof WebsiteError && error.status === 409);
  }
  assert.throws(() => checkDatabaseError({ code: '' }), (error: unknown) => error instanceof WebsiteError && error.status === 503);
});
