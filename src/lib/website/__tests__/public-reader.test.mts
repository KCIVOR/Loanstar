import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_WEBSITE } from '../default-content';
import { loadPublishedWebsite } from '../public-reader';

test('disabled reader never calls source', async () => {
  let calls = 0;
  const result = await loadPublishedWebsite({ enabled: false, source: async () => { calls++; throw Error(); } });
  assert.equal(calls, 0);
  assert.equal(result.origin, 'fallback');
});

test('a complete published three-page snapshot is returned together', async () => {
  const result = await loadPublishedWebsite({ enabled: true, source: async () => ({ revisionId: 'release', publication: { content: DEFAULT_WEBSITE, assets: [] } }) });
  assert.equal(result.origin, 'published');
  assert.equal(result.revisionId, 'release');
  assert.deepEqual(result.content, DEFAULT_WEBSITE);
});

test('partial content and exceptions return only baseline', async () => {
  const { register: removed, ...partial } = DEFAULT_WEBSITE;
  assert.ok(removed);
  for (const source of [async () => ({ revisionId: 'release', publication: { content: partial, assets: [] } }), async () => { throw Error('private failure'); }]) {
    const result = await loadPublishedWebsite({ enabled: true, source });
    assert.equal(result.origin, 'fallback');
    assert.deepEqual(result.content, DEFAULT_WEBSITE);
  }
});

test('never-resolving source is bounded and aborted', async () => {
  let signal: AbortSignal | undefined;
  const start = Date.now();
  const result = await loadPublishedWebsite({ enabled: true, timeoutMs: 15, source: s => { signal = s; return new Promise(() => {}); } });
  assert.equal(result.origin, 'fallback');
  assert.equal(signal?.aborted, true);
  assert.ok(Date.now() - start < 1000);
});

test('fallback diagnostic is safe and cannot break the reader', async () => {
  const reasons: string[] = [];
  const result = await loadPublishedWebsite({ enabled: true, source: async () => { throw Error('secret network data'); }, onFallback: reason => { reasons.push(reason); throw Error('log failure'); } });
  assert.deepEqual(reasons, ['unavailable']);
  assert.equal(result.origin, 'fallback');
});
