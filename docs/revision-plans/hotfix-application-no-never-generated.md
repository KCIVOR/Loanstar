# Hotfix — application_no was never generated (all applications NULL)

**Ground rules (apply to every phase, same as every other item in this workflow):**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- This is DB-only — additive only (new sequence, new function, a `SET DEFAULT`, and a one-time backfill `UPDATE`). No table is dropped or restructured, no application code changes.
- Run existing tests after each phase; do not delete or weaken a test to make it pass.
- Execute phases **in order**. Each phase must leave the app green (tests passing) before the next starts.
- At the end of all phases, output one combined summary: migration(s) applied, backfill row count, tests run/result.

## Background (from conversation, decided scope)

User noticed every loan application in the system shows no application number and asked for a full audit.

## Audit findings (verified 2026-08-13)

- Confirmed live via SQL: **all 15 rows** in `loan_applications` have `application_no IS NULL` — 0 exceptions. Not a recent regression; every application ever created has been missing this.
- Root cause found by comparing `loan_applications.application_no` to the sibling `borrowers.borrower_no` column, both declared in the same migration (`supabase/migrations/20260706120000_p2_borrower_agent_documents.sql`):
  - `borrower_no` has a real generator wired in as its column default:
    ```sql
    CREATE SEQUENCE public.borrower_no_seq START WITH 300001;
    CREATE OR REPLACE FUNCTION public.generate_borrower_no() ...
      SELECT 'BN' || lpad(nextval('public.borrower_no_seq')::text, 6, '0');
    ...
    borrower_no text NOT NULL UNIQUE DEFAULT public.generate_borrower_no(),
    ```
  - `application_no` was only ever declared as `application_no text UNIQUE` — no sequence, no function, no default. Confirmed live: `information_schema.sequences` has zero rows matching `%application%`; `information_schema.triggers` on `loan_applications` has no insert trigger either.
- Confirmed via full-repo search that no application code ever writes `application_no` — it's read/displayed/joined in 59 files (queues, history views, the generated Application Form PDF, etc.) but never assigned, in either application-creation path:
  - `src/app/api/borrower/applications/reloan/route.ts` (borrower-created first/reloan applications) — `insert({...})` at line ~124 does not set `application_no`.
  - `src/lib/csa/create-application.ts` (CSA-opened files) — `insert({...})` at line ~58 does not set `application_no` either.
- `UNIQUE` in Postgres permits unlimited `NULL`s, so this never threw a constraint error — it just silently shipped blank everywhere.

## Scope decision

Two phases, DB-only, split so each one is independently verifiable before moving on:
1. **Phase 1 — generator only.** Add the sequence + function and wire it as the column default. This alone fixes the bug going forward: any application created from this point on (either creation path) gets a real number with zero app-code changes. Existing rows are deliberately left untouched in this phase, so it's verifiable in isolation (create one test application, confirm it gets a number, existing 15 still NULL).
2. **Phase 2 — backfill.** Heal the 15 existing NULL rows using the same generator, assigned in `created_at` order so numbering stays chronological (oldest application gets the lowest number) and shares one continuous sequence with future numbers — no gaps, no collisions.

No application code changes in either phase — both insert paths already omit `application_no` from their payload, so the column default alone is sufficient.

---

## Phase 1 — Generator: sequence + function + column default

**Goal:** Every *new* application gets a permanent, unique `application_no` automatically, with zero application-code changes. Existing rows stay NULL for now — that's Phase 2.

### Files to change

1. **New migration file** `supabase/migrations/20260815000000_application_no_generator.sql`:
   ```sql
   -- Mirrors borrower_no_seq / generate_borrower_no() exactly (see
   -- 20260706120000_p2_borrower_agent_documents.sql) — application_no was
   -- declared with no default and never assigned by any app code, so every
   -- existing application has NULL here. This phase only adds the missing
   -- generator so new inserts get a number; backfilling the 15 existing NULL
   -- rows is Phase 2, deliberately separate so this can be verified alone.

   CREATE SEQUENCE public.application_no_seq START WITH 300001;

   CREATE OR REPLACE FUNCTION public.generate_application_no()
   RETURNS text
   LANGUAGE sql
   AS $$
     SELECT 'AN' || lpad(nextval('public.application_no_seq')::text, 6, '0');
   $$;

   ALTER TABLE public.loan_applications
     ALTER COLUMN application_no SET DEFAULT public.generate_application_no();
   ```
   - Apply via Supabase MCP `apply_migration`, per this repo's established convention (see the "supabase CLI two-folder migration gotcha" — do not use `supabase db push`).
   - Do not touch `borrower_no_seq`, `generate_borrower_no()`, or any other column/sequence/function.
   - Do **not** backfill existing NULL rows in this phase — that's Phase 2.

2. **No application code changes.** Both insert paths (`src/app/api/borrower/applications/reloan/route.ts`, `src/lib/csa/create-application.ts`) already omit `application_no` from their insert payload, so the new column default covers them automatically. Do not add `application_no` to either insert call.

### Validation checklist — Phase 1

- [x] `application_no_seq` exists, `generate_application_no()` exists and returns `AN` + 6-digit zero-padded number (e.g. `AN300001`). *(Confirmed live via SQL.)*
- [x] `loan_applications.application_no` has `DEFAULT public.generate_application_no()`. *(Confirmed live: `column_default = 'generate_application_no()'`.)*
- [x] Creating one new application via either path results in a populated `application_no` with no code change needed. *(Found a real draft application created after this migration — `41bcf5a0-a6d7-4e81-b161-6e5864bd6d24` — already carrying `AN300016`, continuing the sequence with no gap past the 15 backfilled rows.)*
- [x] ~~The 15 pre-existing rows are still NULL~~ — superseded: by the time this was validated, Phase 2 had already landed too, so this specific intermediate state is moot. Confirmed instead that the final state is correct (see Phase 2).
- [x] No existing `borrower_no` row, sequence, or function affected. *(Confirmed live: `borrower_no_seq`/`generate_borrower_no()` unchanged, 0 null `borrower_no` rows.)*
- [x] `npx tsc --noEmit` clean (no code changed, but confirm nothing else broke). *(Re-ran independently — same pre-existing unrelated errors as before this change, nothing new.)*
- [x] Existing test suite still passes. *(Re-ran independently: 885/885.)*

### Status: Done (2026-08-13)

---

## Phase 2 — Backfill existing applications

**Goal:** The 15 applications that predate the generator get real, permanent numbers too — assigned in the order they were actually created, sharing the same sequence as Phase 1 so there's no overlap or reset.

### Files to change

1. **New migration file** `supabase/migrations/20260815010000_application_no_backfill.sql`:
   ```sql
   -- One-time backfill for applications created before the Phase 1 generator
   -- existed. Oldest-first via created_at, so existing applications receive
   -- application_no values in the same order they actually happened — not
   -- table scan/insertion order, which is unspecified.
   DO $$
   DECLARE
     rec RECORD;
   BEGIN
     FOR rec IN
       SELECT id FROM public.loan_applications
       WHERE application_no IS NULL
       ORDER BY created_at
     LOOP
       UPDATE public.loan_applications
       SET application_no = public.generate_application_no()
       WHERE id = rec.id;
     END LOOP;
   END $$;
   ```
   - Apply via Supabase MCP `apply_migration`.
   - Requires Phase 1's `generate_application_no()` to already exist — do not run this phase first.
   - Do not modify any row that already has a non-null `application_no` (the `WHERE application_no IS NULL` guard already ensures this — do not remove it).

### Validation checklist — Phase 2

- [x] All 15 previously-NULL rows now have a non-null, unique `application_no`. *(Re-confirmed independently: `null_remaining = 0`, `distinct_count = 15` of `15` total rows.)*
- [x] Sorting existing applications by `application_no` matches sorting them by `created_at` (oldest application has the lowest number) — confirms chronological backfill order. *(Re-confirmed independently: `row_number() over (order by created_at)` equals `row_number() over (order by application_no)` for all 15 rows, `AN300001`…`AN300015`.)*
- [x] The backfilled numbers and any Phase-1-created new-application numbers form one continuous sequence with no duplicates (same `application_no_seq`, no resets). *(Re-confirmed: `application_no_seq.last_value = 300015`, and the one real post-backfill insert picked up `AN300016` — no gap, no reset.)*
- [x] Spot-check screens that display `application_no`. *(Live browser click-through wasn't possible this session — this tab is authenticated as Collector, who has no visibility into CSA/Committee/LRA application detail. Instead traced the actual query a real screen runs: `src/lib/csa/queue.ts` selects `application_no` directly off `loan_applications` and maps it 1:1 to `applicationNo` with no transformation — same column already confirmed non-null for every row live. This is the identical pattern used earlier in this engagement whenever a role-switch in-browser wasn't reachable.)*
- [x] `npx tsc --noEmit` clean. *(Re-ran independently — same pre-existing unrelated errors only.)*
- [x] Existing test suite still passes. *(Re-ran independently: 885/885.)*

### Status: Done (2026-08-13)

---

## Final combined validation (after both phases land)

- [x] Full test suite run — no new failures.
- [x] All applications (old and new) have a unique, chronologically-consistent `application_no`.
- [x] Confirmed live via SQL: `select count(*) from loan_applications where application_no is null` returns `0`.

### Status: Done (2026-08-13)
