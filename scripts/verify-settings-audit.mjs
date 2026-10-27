// Usage after installing @electric-sql/pglite in a temporary QA directory:
// node scripts/verify-settings-audit.mjs ./tmp/settings-audit-qa/node_modules/@electric-sql/pglite/dist/index.js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const { PGlite } = await import(process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : "@electric-sql/pglite");
const db = new PGlite();
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE supabase_auth_admin;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, encrypted_password text,
      email_change text, email_change_sent_at timestamptz, recovery_sent_at timestamptz);
    CREATE TABLE public.profiles (id uuid PRIMARY KEY REFERENCES auth.users, email text);
    CREATE TABLE public.user_roles (user_id uuid, role_id uuid, assigned_at timestamptz);
    CREATE TABLE public.audit_events (id uuid DEFAULT gen_random_uuid(), actor_id uuid,
      actor_role_id uuid, module_slug text, action text, entity_type text, entity_id text,
      before_data jsonb, after_data jsonb, created_at timestamptz DEFAULT now());
    INSERT INTO auth.users (id, email, encrypted_password)
      VALUES ('11111111-1111-4111-8111-111111111111', 'old@example.com', 'old-hash');
    INSERT INTO public.profiles SELECT id, email FROM auth.users;
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/20261026084635_user_settings_security_audit.sql", import.meta.url), "utf8"));
  assert.equal((await db.query("SELECT public.settings_security_audit_ready() AS ready")).rows[0].ready, false);
  await db.exec("SET request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111'");
  await db.exec("GRANT USAGE ON SCHEMA auth TO authenticated; SET ROLE authenticated");
  assert.equal((await db.query("SELECT public.settings_security_audit_ready() AS ready")).rows[0].ready, true);
  await db.exec("RESET ROLE");
  await db.exec("ALTER TABLE auth.users DISABLE TRIGGER audit_identity_security_change");
  assert.equal((await db.query("SELECT public.settings_security_audit_ready() AS ready")).rows[0].ready, false);
  await db.exec("ALTER TABLE auth.users ENABLE TRIGGER audit_identity_security_change; RESET request.jwt.claim.sub");

  await db.exec("UPDATE auth.users SET email_change = 'new@example.com', email_change_sent_at = now()");
  assert.equal((await db.query("SELECT email FROM profiles")).rows[0].email, "old@example.com");
  assert.equal((await db.query("SELECT action FROM audit_events")).rows[0].action, "email_change_requested");
  await db.exec("UPDATE auth.users SET email = 'new@example.com', email_change = ''");
  assert.equal((await db.query("SELECT email FROM profiles")).rows[0].email, "new@example.com");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM audit_events WHERE action = 'email_changed'")).rows[0].n, 1);

  await db.exec("GRANT USAGE ON SCHEMA auth TO supabase_auth_admin; GRANT SELECT, UPDATE ON auth.users TO supabase_auth_admin; SET ROLE supabase_auth_admin");
  await db.exec("UPDATE auth.users SET encrypted_password = 'new-hash'");
  await db.exec("RESET ROLE");
  const events = (await db.query("SELECT * FROM audit_events")).rows;
  assert.equal(events.filter((event) => event.action === "password_changed").length, 1);
  assert.ok(!JSON.stringify(events).includes("new-hash"));
  assert.ok(!JSON.stringify(events).includes("old-hash"));
  await db.exec("UPDATE auth.users SET encrypted_password = 'new-hash'");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM audit_events WHERE action = 'password_changed'")).rows[0].n, 1);

  await db.exec("UPDATE auth.users SET recovery_sent_at = now()");
  const recovery = (await db.query("SELECT * FROM audit_events WHERE action = 'password_reset_requested'")).rows[0];
  assert.equal(recovery.actor_id, null);
  assert.equal(recovery.entity_id, "11111111-1111-4111-8111-111111111111");

  await db.exec("ALTER TABLE audit_events ADD CONSTRAINT simulate_audit_failure CHECK (action <> 'password_changed') NOT VALID");
  await assert.rejects(db.exec("UPDATE auth.users SET encrypted_password = 'must-rollback'"));
  assert.equal((await db.query("SELECT encrypted_password FROM auth.users")).rows[0].encrypted_password, "new-hash");

  const privileges = (await db.query(`SELECT
    has_function_privilege('anon', 'private.audit_identity_security_change()', 'EXECUTE') AS anon_execute,
    has_function_privilege('authenticated', 'private.audit_identity_security_change()', 'EXECUTE') AS user_execute`)).rows[0];
  assert.equal(privileges.anon_execute, false);
  assert.equal(privileges.user_execute, false);
  console.log("PASS: pending email, confirmed email/profile sync, password audit, no secrets, no duplicate events, anonymous recovery attribution, atomic audit rollback, restricted trigger execution");
} finally {
  await db.close();
}
