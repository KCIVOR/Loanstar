// Read-only staging API verification. No mutation or Auth login is performed.
import fs from 'node:fs';
import { parseEnv } from 'node:util';
const target = process.argv.find(value => value.startsWith('--project-ref='))?.split('=')[1];
if (target !== 'ddsvqjaknuniekygpbdr') throw Error('Explicit --project-ref=ddsvqjaknuniekygpbdr required; production is prohibited');
const env = parseEnv(fs.readFileSync('.env.development.local', 'utf8'));
const base = `https://${target}.supabase.co`;
if (env.NEXT_PUBLIC_SUPABASE_URL !== base) throw Error('Local staging URL mismatch');
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!key) throw Error('Staging public key missing');
const get = path => fetch(`${base}${path}`, { headers: { apikey: key }, signal: AbortSignal.timeout(10000) });
const live = await get('/rest/v1/website_publications?site_key=eq.main&select=revision_id,public_content');
if (!live.ok) throw Error(`Published projection failed: HTTP ${live.status}`);
const rows = await live.json();
if (rows.length !== 1 || !rows[0].public_content?.content?.landing || !rows[0].public_content.content.login || !rows[0].public_content.content.register) throw Error('Complete three-page publication missing');
console.log('PASS anonymous complete three-page snapshot; release:', rows[0].revision_id);
for (const table of ['website_drafts', 'website_revisions', 'website_assets', 'website_revision_assets']) {
  const response = await get(`/rest/v1/${table}?select=*&limit=1`);
  if (response.status !== 401 && response.status !== 403) throw Error(`${table} is not explicitly denied to anonymous clients`);
  console.log(`PASS anonymous private-table denial: ${table}`);
}
for (const asset of rows[0].public_content.assets ?? []) {
  const response = await fetch(`${base}/storage/v1/object/public/website-public/${asset.publicPath}`, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw Error('Published asset unavailable');
}
console.log('PASS current published media available');
console.log('Migration versions, catalog RLS/ACLs and transaction tests require the SQL/MCP checks recorded in docs/website-cms-backend-evidence.md; REST alone cannot attest migration history.');
