// Isolated PostgreSQL test. This never connects to a Supabase project.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const runtime = process.argv[2] ?? './tmp/settings-audit-qa/node_modules/@electric-sql/pglite/dist/index.js';
const { PGlite } = await import(pathToFileURL(path.resolve(runtime)).href);
const db = new PGlite();
const actor = '11111111-1111-4111-8111-111111111111';
const inactive = '33333333-3333-4333-8333-333333333333';
const editor = '44444444-4444-4444-8444-444444444444';
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE public.profiles(id uuid PRIMARY KEY,is_active boolean NOT NULL);
    CREATE TABLE public.modules(slug text,name text,description text,sort_order integer);
    CREATE TABLE storage.objects(bucket_id text,name text);
    CREATE TABLE storage.buckets(id text,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE public.audit_events(actor_id uuid,module_slug text,action text CHECK(action<>'website_published'),entity_type text,entity_id text,after_data jsonb);
    INSERT INTO auth.users VALUES('${actor}'),('${inactive}'),('${editor}');
    INSERT INTO public.profiles VALUES('${actor}',true),('${inactive}',false),('${editor}',true);
    CREATE FUNCTION public.is_super_admin(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT $1 IN ('${actor}'::uuid,'${inactive}'::uuid)$$;
    CREATE FUNCTION public.has_module_permission(text,text,uuid) RETURNS boolean LANGUAGE sql AS $$SELECT $3 IN ('${actor}'::uuid,'${inactive}'::uuid,'${editor}'::uuid)$$;
  `);
  const migrations = fs.readdirSync('supabase/migrations');
  for (const suffix of ['_website_cms_foundation.sql', '_website_cms_baseline.sql', '_website_cms_conflict_sqlstate.sql']) {
    const file = migrations.find(name => name.endsWith(suffix));
    if (!file) throw new Error(`Missing migration ${suffix}`);
    await db.exec(fs.readFileSync(path.join('supabase/migrations', file), 'utf8'));
  }
  const before = await db.query('SELECT revision_id FROM public.website_publications');
  const state = await db.query('SELECT lock_version FROM public.website_drafts');
  for (const deniedActor of [inactive, editor]) {
    await assert.rejects(() => db.query(`SELECT public.website_publish('${deniedActor}',${state.rows[0].lock_version},'${before.rows[0].revision_id}',gen_random_uuid(),'Permission test')`), error => error.code === '42501');
  }
  const draft = await db.query('SELECT content FROM public.website_drafts');
  await assert.rejects(() => db.query('SELECT public.website_save_draft($1,$2,$3)', [inactive,state.rows[0].lock_version,JSON.stringify(draft.rows[0].content)]), error => error.code === '42501');
  console.log('PASS: inactive Super Admin and full-permission non-Super-Admin editor cannot publish; inactive actor cannot save.');
  await assert.rejects(() => db.query(`SELECT public.website_publish('${actor}',${state.rows[0].lock_version},'${before.rows[0].revision_id}','22222222-2222-4222-8222-222222222222','Forced audit INSERT rejection')`), error => error.code === '23514' && error.constraint === 'audit_events_action_check');
  const after = await db.query('SELECT revision_id FROM public.website_publications');
  assert.deepEqual(after.rows, before.rows);
  assert.deepEqual((await db.query('SELECT lock_version FROM public.website_drafts')).rows, state.rows);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM public.website_revisions')).rows[0].count, 1);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM public.audit_events')).rows[0].count, 0);
  console.log('PASS: a real audit INSERT constraint failure rolls back revision, publication and draft changes atomically.');
} finally { await db.close(); }
