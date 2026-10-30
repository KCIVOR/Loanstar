import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { WebsiteError } from '../errors';

// Exercise the actual factory without loading Next's server-only dependencies.
const source = readFileSync(new URL('../admin-service.ts', import.meta.url), 'utf8');
const file = ts.createSourceFile('admin-service.ts', source, ts.ScriptTarget.Latest, true);
const factory = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'websiteServiceClient');
assert.ok(factory);
const code = ts.transpile(factory.getText(file).replace(/^export /, ''));

for (const ref of ['ddsvqjaknuniekygpbdr', 'acopcwlhkovssjnrqygk']) {
  test(`CMS permits verified project ${ref}`, () => {
    const client = {};
    const result = runInNewContext(`${code}; websiteServiceClient()`, {
      process: { env: { NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co` } },
      WebsiteError, createServiceClient: () => client,
    });
    assert.equal(result, client);
  });
}

for (const url of [undefined, '', 'https://unknown.supabase.co', 'https://acopcwlhkovssjnrqygk.supabase.co.attacker.test']) {
  test(`CMS blocks unverified URL ${url}`, () => {
    let created = false;
    assert.throws(() => runInNewContext(`${code}; websiteServiceClient()`, {
      process: { env: { NEXT_PUBLIC_SUPABASE_URL: url } }, WebsiteError,
      createServiceClient: () => { created = true; },
    }), (error: unknown) => error instanceof WebsiteError && error.status === 503);
    assert.equal(created, false);
  });
}
