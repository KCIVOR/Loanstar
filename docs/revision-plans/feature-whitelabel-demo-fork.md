# Feature — Fork the system into a de-branded demo instance (new repo/Supabase/Vercel)

**Ground rules (apply to every phase):**
- Touch only the files listed under "Files to change" for the de-branding phase — this is a text/copy sweep, not a redesign. Do not change colors, layout, component structure, or the design system itself (the "Meridian" design tokens are already generic — confirmed no brand-specific hex values, only comment headers reference the name).
- **Account-level actions (creating a GitHub repo, a Supabase project, a Vercel project, pushing to a new remote) are the user's own actions** — Claude/Cursor cannot and should not do these autonomously. Each such step below is explicitly marked **[USER ACTION]**, with exact commands/values to use. Code-editing phases are marked **[CURSOR]**.
- Run existing tests after the de-branding phase; update the tests that assert on literal brand text (listed below) rather than skipping them.
- At the end, output a summary: files changed, tests updated, final verification checklist result.

## Background (from conversation, decided scope)

User's boss needs a version of this system with no LoanStar company branding — a separate GitHub repo, separate Supabase project, separate Vercel deployment, for demo purposes. Decided scope (confirmed by user):
- **Branding**: generic/neutral placeholder identity, not a specific new brand — easy to swap in a real one later.
- **Data**: the new Supabase project starts fresh — schema, RLS, roles/modules/permissions, and login-capable seed accounts only. No borrower/application/payment/masterlist data carried over.

## Audit findings (verified 2026-08-15)

- **The logo/icon are not hardcoded in code** — `src/lib/branding.ts` builds `BRANDING.logoUrl`/`BRANDING.iconUrl` from `NEXT_PUBLIC_SUPABASE_URL` + a fixed path in a public Supabase Storage bucket (`branding/logo.png`, `branding/favicon.png`). Once this app points at a new Supabase project, the logo automatically becomes whatever's in *that* project's `branding` bucket — no code change needed for the visual mark itself, only for what gets uploaded there (Phase 3).
- **There is also a separate static Next.js favicon** at `src/app/favicon.ico` (the browser-tab icon Next.js serves by convention) — independent of the Storage-bucket-driven `BRANDING.iconUrl`, needs its own neutral replacement.
- **The design system itself needs no changes** — `src/app/globals.css`'s only brand references are two comment-header lines (`MERIDIAN — LoanStar Design System v1.1`), no colors/tokens are brand-specific.
- **Every remaining brand reference is copy/text**, not styling — confirmed via a full-repo sweep (`grep -rn "LoanStar\|Loan Star\|LOAN STAR\|loanstar\.local"` across `src/`), 32 files. Categorized by what actually needs to change for a working de-branded demo:
  - **Company name in generated legal documents**: `src/lib/documents/generators/shared.ts:5` — `export const COMPANY_NAME = "Loan Star Lending Group Corp."`, used across PDF generators (Application Form, Promissory Note, etc.). **A second, separate hardcoded occurrence exists** at `src/lib/lra/template-context.ts:157` (`companyName: "Loan Star Lending Group Corp."`) — not sourced from the shared constant, an existing inconsistency to fix while touching this anyway.
  - **Public marketing/landing page** (`src/app/page.tsx`): the heaviest concentration — "Why LoanStar" nav link, "Loan Star Lending Group Corp. — trusted lending for Filipino..." hero copy, "© 2026 LOAN STAR LENDING GROUP CORP." footer, multiple `<LoanStarLogo>` usages.
  - **Login/register/password pages** (`login/page.tsx`, `register/page.tsx`, `reset-password/page.tsx`, `forgot-password/page.tsx`): logo usages, "Log in to your LoanStar portal." copy, and — the functionally important one — **10 seed account emails all end in `@loanstar.local`** (`login/page.tsx:20-30`).
  - **Borrower-facing copy** (`src/lib/borrowers/home.ts`): several status messages literally say "not yet visible to Loan Star" / "Waiting on LoanStar" / "contact LoanStar support" / "LoanStar will complete the release shortly."
  - **Outbound communications**: `src/lib/email/meridian-layout.ts` (email header/footer template, `alt="LoanStar"`, footer signature), `src/lib/email/meridian-default-bodies.ts` (default email body copy, 3 templates), `src/lib/collector/reminder-scan.ts:48` (the literal SMS text sent to real borrowers — `"LoanStar reminder: Hi ${borrowerName}..."`), `src/app/api/admin/sms/test/route.ts:21` (test SMS body).
  - **A verification-call script line** read aloud to references during CIG's CI verification calls: `src/components/cig/CiReferencesFormModal.tsx:686` — "Aside from LOAN STAR is there any other FINANCING / BANK..." — this is spoken content, not internal-only, worth genericizing for a clean demo.
  - **Page `<title>`**: `src/app/layout.tsx:27` — `"LoanStar — Lending, charted clearly"`.
  - **Admin-facing cosmetic-only text**: `src/app/admin/config/page.tsx:539` (an input placeholder hint), `src/lib/documents/templates/fields.ts:214` (a sample-value hint in the document-template editor) — low-stakes but easy to include in the same sweep.
  - **Pure code comments, zero user-visible or functional impact** — `src/lib/constants.ts:1,30`, `src/lib/computation/sf.ts:175`, `src/lib/committee/votes.ts:61` (all reference internal spec-document filenames like `LoanStar_SF_Computation_Specification`) — **optional, lowest priority, skip unless time allows**, since changing these has zero effect on what the boss sees.
  - **`src/app/design/page.tsx`** — an internal, nav-unlinked design-system showcase page (comment confirms "Not linked from app nav") — low priority, optional.
- **Tests that assert on the literal string "LoanStar"** will break once the source templates change — must be updated in the same phase, not left red: `src/lib/email/__tests__/smtp-config.test.mts` (`:23,68`), `src/lib/email/__tests__/meridian-layout.test.mts` (`:14,21,26,32`), `src/lib/email/__tests__/decision-templates.test.mts` (`:22`).
- **No brand-name enum/constraint anywhere in the database** — this is purely an application-layer/content concern, no migration needed for the branding sweep itself.
- **Seed accounts cannot be created via a plain SQL migration** (same finding as the Collection Head work) — `auth.users.encrypted_password` needs Supabase Auth's own hashing, requires the Admin API/dashboard, not a raw `INSERT`.

## Scope decision

Six phases, roughly in dependency order: repo first (nothing to deploy without it), then the Supabase project + schema (the app needs somewhere to point at), then the de-branding code sweep (can happen in parallel with Supabase setup, sequenced after for clarity), then env wiring + fresh seed accounts + branding assets, then populating presentation-ready demo data across every module, then Vercel deployment + final verification.

---

## Phase 0 — New GitHub repository **[USER ACTION]**

**Goal:** A separate, independent repo exists with this codebase's current state, no shared history dependency going forward.

### Steps

1. Create a new empty repository on GitHub (no README/license/gitignore — keep it empty so a plain push works cleanly).
2. From this project's root:
   ```bash
   git remote add demo-origin <new-repo-url>
   git push demo-origin main
   ```
   (Use a new remote name like `demo-origin` rather than overwriting `origin`, so this working copy still points at the real LoanStar repo for everything else — do not repoint the primary `origin`.)
3. Confirm the push succeeded and the new repo shows the full commit history.

**Do not** delete or force-push anything on the original `origin` remote as part of this — this is purely additive, a second push target.

---

## Phase 1 — New Supabase project + schema **[USER ACTION, migration replay can be Cursor-assisted]**

**Goal:** A separate Supabase project exists with the identical schema/RLS/roles/modules — but zero borrower/application/payment data.

### Steps

1. **[USER ACTION]** Create a new Supabase project via the dashboard. Note its project ref, URL, anon key, and service role key.
2. **[CURSOR, once given the new project's credentials]** Replay every migration file from `supabase/migrations/` (and confirm `loanstar/supabase/migrations/` is the mirrored copy per this repo's two-folder convention) against the new project, in filename order, via Supabase MCP `apply_migration` — same mechanism already used throughout this engagement, just pointed at the new project ref instead of `acopcwlhkovssjnrqygk`.
3. Confirm live on the new project: `modules`, `roles`, `role_module_permissions` tables are fully seeded (should match `20260706100002_p1_seed_data.sql` plus every later role/permission migration — `briefings`/`collection_head` included, since that's part of the current schema now). Confirm `borrowers`, `loan_applications`, `masterlist`, `payments`, etc. are all present but **empty** (0 rows) — this is expected and correct per the "fresh" data decision.
4. **[USER ACTION]** Create a public Storage bucket named `branding` in the new project (matching `src/lib/branding.ts`'s expected path) — leave it empty for now, Phase 3 uploads a neutral placeholder into it.

---

## Phase 2 — De-branding code sweep **[CURSOR]**

**Goal:** Every user-visible or outbound-communication reference to "LoanStar"/"Loan Star"/"LOAN STAR" is replaced with a generic placeholder, centralized where possible so a real brand can be dropped in later with minimal edits.

### Files to change

1. **`src/lib/documents/generators/shared.ts`** — change `COMPANY_NAME` to a generic placeholder, e.g. `"Lending Platform"` (confirm the exact wording the user wants for the demo before finalizing — a reasonable default, not a hard requirement).
2. **`src/lib/lra/template-context.ts:157`** — fix the existing inconsistency: change this hardcoded `companyName` to import and use `COMPANY_NAME` from `shared.ts` instead of its own separate literal (closes a pre-existing duplication, not just a rename).
3. **`src/app/page.tsx`** — replace all LoanStar/Loan Star Lending Group Corp. text (nav link, hero copy, footer copyright) with the same generic placeholder name. Keep `<LoanStarLogo>` component usages as-is (the component name is internal — its rendered output already becomes generic once Phase 3's new bucket has a neutral image).
4. **`src/app/layout.tsx:27`** — change the page `<title>` to a generic equivalent (e.g. `"Lending Platform — demo"`).
5. **`src/app/login/page.tsx`** — change all 10 `SEED_ACCOUNTS` emails from `@loanstar.local` to a generic domain (e.g. `@example.local` — confirm the actual domain to use, must match whatever Phase 4 actually creates the auth users under). Change "Log in to your LoanStar portal." copy.
6. **`src/app/register/page.tsx`, `src/app/reset-password/page.tsx`, `src/app/forgot-password/page.tsx`** — no text changes needed beyond the logo (already generic via Phase 3), confirm no other hardcoded brand copy exists on these three before skipping them.
7. **`src/lib/borrowers/home.ts`** — replace "Loan Star"/"LoanStar" in the four status-message strings (`:189-190,210,244,264`) with the generic placeholder.
8. **`src/lib/email/meridian-layout.ts`** — replace `<title>LoanStar</title>`, `alt="LoanStar"`, and the footer signature text with the generic placeholder.
9. **`src/lib/email/meridian-default-bodies.ts`** — replace "LoanStar" across all three default email bodies (`:9,15,24,31,39,40,43`) with the generic placeholder.
10. **`src/lib/collector/reminder-scan.ts:48`** — replace the literal outbound SMS text prefix.
11. **`src/app/api/admin/sms/test/route.ts:21`** — replace the test SMS body text.
12. **`src/components/cig/CiReferencesFormModal.tsx:686`** — replace "LOAN STAR" in the verification-call script line with the generic placeholder.
13. **`src/app/admin/config/page.tsx:539`, `src/lib/documents/templates/fields.ts:214`** — replace the two cosmetic placeholder/sample-value strings.
14. **`src/app/favicon.ico`** — replace with a neutral placeholder icon (any simple generic image; do not leave the LoanStar star mark here even though `BRANDING.iconUrl` is separately handled via Phase 3 — this static file is Next.js's own favicon convention and won't automatically follow the Storage bucket).
15. **Test files** — update the literal-string assertions in `src/lib/email/__tests__/smtp-config.test.mts`, `src/lib/email/__tests__/meridian-layout.test.mts`, `src/lib/email/__tests__/decision-templates.test.mts` to match whatever generic placeholder text was actually used in steps 8–9, so these tests stay meaningful (asserting the new correct text) rather than being weakened or deleted.
16. **Optional, skip unless time allows** — `src/lib/constants.ts:1,30`, `src/lib/computation/sf.ts:175`, `src/lib/committee/votes.ts:61`, `src/app/globals.css:4-5`, `src/app/design/page.tsx:5,27` — all pure code comments or an unlinked internal showcase page, zero effect on what a demo viewer sees.

### Validation checklist — Phase 2

- [ ] `grep -rn "LoanStar\|Loan Star\|LOAN STAR" src/` returns only the optional/comment-only occurrences listed above (or zero, if those were also swept).
- [ ] `grep -rn "loanstar\.local" src/` returns zero matches once Phase 4's new seed emails replace them.
- [ ] The public landing page, login page, borrower status messages, and generated PDF documents (spot-check one, e.g. Application Form) all show the new generic name consistently — not a mix of old and new text.
- [ ] Every updated test file's assertions match the new text and pass.
- [ ] `npx tsc --noEmit` clean.
- [ ] Existing test suite still passes (with the 3 updated test files reflecting the new text, not skipped).

### Status: Not started

---

## Phase 3 — Environment wiring + neutral branding assets **[USER ACTION for secrets, CURSOR for code/config]**

**Goal:** The de-branded codebase actually points at the new Supabase project, and the branding bucket has a neutral placeholder image so the logo doesn't render broken.

### Steps

1. **[USER ACTION]** Create a new `.env.local` (or equivalent, not committed) with the new Supabase project's URL, anon key, and service role key, plus any other environment variables the app currently requires (confirm the full list from the existing `.env.local`/`.env.example` before assuming — copy every key, not just the Supabase ones, e.g. SMTP/Twilio config if those are meant to still work in the demo, or left blank if not).
2. **[USER ACTION]** Upload a neutral placeholder image to the new project's `branding` Storage bucket as `logo.png` and `favicon.png` (matching the exact paths `src/lib/branding.ts` expects) — a plain wordmark/icon, nothing LoanStar-branded.
3. Confirm the app, run locally against the new project, actually renders the neutral logo (not a broken image icon) on the login page and sidebar.

---

## Phase 4 — Fresh seed accounts on the new project **[USER ACTION, mirrors the Collection Head precedent]**

**Goal:** The new project has the same 10 login-capable seed roles as the original, generic email domain, no borrower/application data.

### Steps

1. For each of the 10 roles (Super Admin, Agent, CSA, CIG, Committee, LRA, AR, Collector, Collection Head, Remedial, Borrower — 11 actually, confirm the current full list from Phase 2's updated `login/page.tsx`), create an auth user via Supabase's Admin API/dashboard (same constraint as the Collection Head account earlier — cannot be a raw SQL `INSERT`), using the new generic email domain decided in Phase 2 and the same shared seed password convention (or a new one — confirm).
2. For each, insert a matching `profiles` row and a `user_roles` assignment to the corresponding role — mirror the exact shape of the original project's seed accounts (query the original project's `profiles`/`user_roles` for one example row per role as a template, per this engagement's established "verify live, don't assume the shape" practice).
3. Do **not** create any `borrowers`, `loan_applications`, `masterlist`, or `payments` rows — per the "fresh/empty" decision, these accounts exist only so each portal is reachable and demonstrable, not populated with test data.

### Validation checklist — Phase 4

- [ ] All 11 seed accounts can actually log in on the de-branded app pointed at the new project.
- [ ] Each lands on the correct portal for their role, showing an empty state (no accounts/applications) rather than an error.
- [ ] No data from the original LoanStar project exists anywhere in the new project's tables.

---

## Phase 5 — Populate presentation-ready demo data **[CURSOR — build the script; USER ACTION to run it]**

**Goal:** After Phase 4's fresh, empty database, this phase adds a realistic, varied set of loan applications spanning every module and pipeline stage, so a client presentation has real screens to click through instead of empty states everywhere.

### Audit findings (verified 2026-08-15)

- **No seed script exists anywhere in this repo** (confirmed earlier this session via repo-wide search) — every piece of test data seen throughout this engagement was created either by manually walking the real UI as each role, or by direct one-off SQL for narrow verification purposes. Neither is a good foundation for "many varied, correct-looking loans across every stage."
- **The safe approach is to reuse the app's own service-layer functions, not hand-written SQL inserts.** Confirmed these exist as plain importable functions (not embedded only in API route handlers), callable directly against a Supabase client: `createCsaApplication` (`src/lib/csa/create-application.ts`), `persistComputation` (`src/lib/csa/computation.ts`), and the equivalent functions for CIG verification, Committee voting/decision, LRA release, AR masterlist creation (`src/lib/ar/masterlist.ts`), and Collector payment recording (`src/lib/ar/posting.ts`). Driving data creation through these — rather than raw `INSERT`s — guarantees every computed/derived field (computation snapshots, status history, audit events, checklist completeness, aging) ends up in a state the real app actually produces, so nothing looks broken or inconsistent when clicked into during a demo.
- **A raw-SQL seed would be faster to write but risky for a client-facing demo** — this pipeline has real interdependencies (a `loan_applications` row alone doesn't make a believable file; it needs a matching `computations` row, `verifications` row, `committee_votes`, `release_files`/`generated_documents`, a `masterlist` row with correct `aging_bucket`, etc., each computed by real logic). Hand-faking all of that correctly is more error-prone than just calling the same functions the app already uses.

### Scenario matrix — 11 archetypes, each repeated for volume

Same 11 pipeline archetypes as before, but each one gets **multiple instances** (different synthetic borrower, different amounts/dates) so the demo has real volume in every queue/list, not one lonely row per screen:

| # | Segment | Entity type | Stage / status | Demonstrates | Instances |
|---|---|---|---|---|---|
| 1 | Seafarer | — | Draft (CSA intake, not yet submitted) | Borrower/CSA intake UI, incomplete checklist state | 3 |
| 2 | Seafarer | — | Endorsed, pending CIG verification | CIG queue, CI & References Form | 4 |
| 3 | Seafarer | — | Forwarded to Committee, pending vote | Committee voting queue, 4 Cs | 4 |
| 4 | Seafarer | — | Approved, LRA release in progress (some docs signed, some not) | LRA signing workflow, Collection Head briefing queue | 3 |
| 5 | Seafarer | — | Active loan, on-time, partially paid | AR masterlist, Collector accounts, normal payment history | 6 |
| 6 | Seafarer | — | Active loan, 91+ days overdue, turned over to Remedial | The full aging → remedial flow just built/audited this session | 3 |
| 7 | Seafarer | — | Fully paid off | Borrower's own "paid off" view, AR closed-accounts history | 4 |
| 8 | Seafarer | — | Denied (CIG or Committee denial) | Denial-notice flow, CIG denial-calls queue | 2 |
| 9 | SME | Individual | Active loan, on-time | SME-specific checklist/computation/application form | 3 |
| 10 | SME | Corporate | Pending CIG verification (Field Visit stage) | SME Field Visit form, corporate document set | 3 |
| 11 | Seafarer | — | Reloan — paired with one of scenario 7's paid-off borrowers, who now has a second active/in-progress application | Reloan segment-choice flow, draft-delete, borrower history | 3 pairs |

~40 applications total. Every instance needs its own distinct synthetic borrower (name, email, phone) — reusing an identity across unrelated loans would look wrong in a walkthrough, except scenario 11's intentional reloan pairing (same borrower, two applications).

### Correctness & safety mechanism — this is the part that actually prevents FK errors and half-created data

Volume raises the odds of something breaking mid-run, so the script itself must guarantee no partial/orphaned state, not just "hope nothing throws":

1. **One scenario instance = one atomic unit.** Each instance's full creation sequence (borrower → application → computation → verification → vote → release → masterlist → payments, whichever subset applies) must be wrapped so that if *any* step throws, everything already written for that instance is rolled back before moving on — either via a real Postgres transaction if the service functions support running inside one, or via an explicit compensating cleanup (delete what was created, in reverse dependency order) in a `catch` block. Never leave a borrower with no application, or an application with no computation, because a later step failed.
2. **Insert order must always respect foreign keys** — this falls out naturally from reusing the app's real service functions (`createCsaApplication` before `persistComputation` before endorsement before verification, etc., same order the real app enforces), but the script must not skip steps or jump straight to a later stage's tables (e.g. never insert a `masterlist` row without first going through the real release path that creates it) — that's exactly how you'd get a row referencing a `loan_application_id` that's in the wrong status for what the row implies.
3. **No unique-constraint collisions at volume**: generate each synthetic borrower's email, phone, and any other unique field deterministically but distinctly (e.g. `demo.borrower.<n>@example.local`, incrementing) — never reuse a literal string across instances. `borrower_no`/`application_no` are already safe (generated by the DB's own sequences, confirmed working correctly from the earlier `application_no` fix this session) — the script must **not** set these manually, only let the database assign them.
4. **Tag every script-created row for identifiability and safe re-runs** — e.g. every synthetic borrower's `email` uses a single recognizable domain (`@example.local` or similar, matching whatever Phase 2 chose for seed accounts), so all demo data can be found and wiped with one query if the script needs to be re-run cleanly, rather than accumulating duplicate scenarios on every run.
5. **Log every created record's id and type as the script runs** (to a file or stdout) — if it fails partway through instance 23 of 40, the log shows exactly what exists and what doesn't, so it's obvious whether to resume, clean up, or re-run from scratch, rather than having to inspect the database blind.
6. **A mandatory post-run integrity sweep, before this phase is considered done** — a verification query (or short script) checking for orphaned rows across the whole chain: any `loan_applications` row with no matching `borrowers`, any `masterlist` with no matching `loan_applications`, any `payments`/`dcr_items` with no matching `masterlist`/`dcr`, any `computations`/`verifications`/`committee_votes` with no matching `loan_applications`. This must return **zero rows** before the phase is marked done — not "looked fine when I clicked around."

### Files to change

1. **New script**, not part of the app's runtime code — e.g. `scripts/seed-demo-data.ts`, run manually via `tsx`/`ts-node` against the **new** Supabase project's service-role key (never against the original `acopcwlhkovssjnrqygk` project — this script must take the target project's URL/service key as explicit input, not a hardcoded default, to make that mistake structurally hard to make).
   - Structure it as a loop over the scenario matrix (archetype × instance count), each instance built via the same real service-layer functions as before (`createCsaApplication`, `persistComputation`, CIG verification, Committee vote/decision, LRA release, AR masterlist creation, Collector payment recording, the aging-backdate + `refresh_one_masterlist_aging()` technique for scenario 6), wrapped per the atomicity/rollback requirement above.
   - Use the Phase 4 seed staff accounts as the actors for each stage transition, so `status_history`/audit events show varied real actor names rather than one account doing everything.
   - Include a `--dry-run` mode (or equivalent) that logs what *would* be created without writing anything, so the target project/scenario counts can be sanity-checked before actually running it against real infrastructure.
2. **New verification script/query** (can be a second small script, or a documented SQL query run manually) implementing the mandatory integrity sweep from point 6 above.
3. Do not touch any production/runtime application code as part of this phase — this is a standalone data-population script, not a feature.

### Validation checklist — Phase 5

- [ ] All ~40 instances across all 11 archetypes exist in the new project's database, each reachable and correctly rendered end-to-end in the actual app UI (not just present as raw rows) — spot-check at least one instance per archetype by actually opening it as the relevant role.
- [ ] The integrity sweep (point 6) returns zero orphaned rows across every table in the chain.
- [ ] No unique-constraint violations occurred during the run (confirm from the script's own log, not just "it finished") — every borrower's email/phone is genuinely distinct.
- [ ] Re-running the script either safely no-ops on already-created demo data or is explicitly documented as "wipe demo data first" — confirm which behavior it actually has, don't assume.
- [ ] If the script was interrupted or errored partway through a real run, confirm no partial/orphaned instance was left behind (re-run the integrity sweep after a deliberately-interrupted test run, not just a clean successful one).
- [ ] The script was run only against the new project, never the original — confirm via the script's required explicit target-project input, and by checking the original project's data is unchanged after running it.
- [ ] `npx tsc --noEmit` clean.
- [ ] Existing test suite still passes (this script isn't part of the app bundle, so it shouldn't affect this, but confirm).

### Status: Not started

---

## Phase 6 — Vercel deployment **[USER ACTION]**

**Goal:** The de-branded, fresh-data demo is live at its own URL.

### Steps

1. Create a new Vercel project, connect it to the new GitHub repo from Phase 0 (not the original LoanStar repo).
2. Set every environment variable from Phase 3's `.env.local` in Vercel's project settings (production + preview, as appropriate).
3. Deploy. Confirm the live URL loads, shows the generic branding, and each of the 11 seed accounts can log in and reach their portal — now populated with Phase 5's demo scenarios, not empty.
4. **[USER ACTION, explicit]** Decide and confirm the actual custom domain (if any) or default `*.vercel.app` URL to hand to your boss.

---

## Explicitly out of scope

- Any change to business logic, computation, permissions, or workflow — this is a rebrand + fresh deployment, not a feature change.
- Building a specific new brand identity (logo design, brand name, color palette) — generic placeholder only, per the decided scope. A real identity can be dropped in later by re-uploading the Storage bucket assets and re-running Phase 2's text sweep with real values.
- Keeping the two repos/deployments in sync going forward — this plan produces a one-time fork; whether future work gets applied to both or just the original is a separate process decision, not addressed here.
- Migrating or anonymizing any real production data — moot, since the new project starts fresh per the decided scope.

## Final combined validation (after all phases land)

- [ ] The new repo, Supabase project, and Vercel deployment are all fully independent of the original — no shared credentials, no shared data, no accidental cross-writes.
- [ ] A full manual walkthrough on the live demo URL: login page shows generic branding, each of Phase 5's 11 archetypes has at least one instance opening correctly under the relevant role's portal (not empty, not broken), every list/queue screen shows real volume (not one lonely row), one generated PDF document (e.g. Application Form on one of the demo applications) shows the generic company name, one outbound email/SMS template (test-send if available) shows the generic name.
- [ ] The original LoanStar repo, Supabase project (`acopcwlhkovssjnrqygk`), and Vercel deployment are completely untouched by any of this — confirm `git remote -v` in the original working copy still shows only the original `origin`, and the original Supabase project's data is unaffected.
