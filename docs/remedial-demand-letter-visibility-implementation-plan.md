# Remedial Demand-Letter Visibility Implementation Plan

**Goal:** Once an account is turned over to Remedial, the assigned Remedial officer gets the same "Demand Letter" button as Collector — they can view any demand letters Collector already generated for that account, and generate new ones themselves.

**Root cause:** Demand-letter generation and storage already work (`src/lib/documents/generators/demand-letter.ts`), but are reachable only through a Collector-only route (`src/app/api/collector/accounts/[id]/demand-letter/route.ts:27,56` — both GET and POST call `requireModulePermission("collection", ...)`) and a Collector-only UI (`src/components/collector/DemandLetterModal.tsx`, mounted only in `src/app/collector/accounts/page.tsx:801`). Underneath that, `rendered_documents` RLS (`rendered_documents_select`/`_insert`/`_update`) checks `has_module_permission(module, 'view'/'edit')` against the row's `module` column, hardcoded to `'collection'` for demand letters. The `remedial` role has **no grant at all** on the `collection` module (confirmed live: zero rows in `role_module_permissions` for `role_slug='remedial', module_slug='collection'`), so a Remedial-side route would be blocked at the database layer even before reaching the UI question.

**Approach:** Add a narrowly-scoped RLS branch on `rendered_documents` (gated on `document_slug = 'demand_letter'`, not the whole `collection` module, to avoid handing Remedial the rest of the Collector surface) that recognizes Remedial ownership via the `assignments.remedial_user_id` + `masterlist.remedial_flag` pattern already used elsewhere in this codebase for the same Collector/Remedial split. Add a mirrored Remedial API route and generalize the existing modal component so both roles use the same component and see the same letters — since both read from the same `rendered_documents` rows keyed by `loan_application_id`, a Collector-generated letter is automatically visible to Remedial the moment the RLS branch allows it, with no copy/sync step needed.

**Tech stack:** Next.js (App Router) + TypeScript, Supabase Postgres with RLS, `node --test` on `.mts` files (`package.json:10`).

**Source:** UAT #65, 2026-09-23 session, tracked at `docs/uat-issues-2026-09-23.md` item 4. User decision this session (narrowed from the original tracker item): Remedial gets the same Demand Letter button as Collector — view + generate — on turned-over accounts, and sees whatever Collector already generated. No queue-level "missing notice" indicator, no turnover gating — both explicitly dropped from scope.

## Open questions (resolve before implementing)

None. The one open question in the prior draft — whether Remedial's `deadlineDays` should match Collector's optional 1–90 override (default 15) or use a fixed default — is resolved: **keep it identical to Collector's**, confirmed 2026-09-24. The Remedial route's `bodySchema` is a byte-for-byte copy of the Collector route's, including the `deadlineDays` field.

---

## Live database/system validation: 2026-09-24

Project `acopcwlhkovssjnrqygk`, read-only queries only.

- **`rendered_documents` RLS policies** (`pg_policy` on `public.rendered_documents`):
  - `rendered_documents_insert` (INSERT): `is_super_admin() OR has_module_permission(module, 'edit')`.
  - `rendered_documents_select` (SELECT): `is_super_admin() OR has_module_permission(module, 'view') OR (borrower owns the loan_application via borrowers.user_id = auth.uid())`.
  - `rendered_documents_update` (UPDATE): `is_finalized = false AND (is_super_admin() OR has_module_permission(module, 'edit'))`, check `is_finalized = false`.
  - None reference `assignments` or per-account ownership — access today is purely module-level, which is exactly why a Collector-generated letter is invisible to Remedial: Remedial has no `collection`-module grant at all.
- **`has_module_permission(p_module_slug, p_permission, p_user_id)`** (`pg_get_functiondef`): super-admin short-circuit, else `bool_or(...)` over `user_roles ur JOIN roles r ... JOIN role_module_permissions rmp ... JOIN modules m ... WHERE ur.user_id = p_user_id AND m.slug = p_module_slug`, `COALESCE(..., false)` — absence of a role/module row means no permission, not an error.
- **`role_module_permissions` for `collection`/`remedial`** (live query): `remedial` role has a row only for `module_slug='remedial'` (`can_view=true, can_create=true, can_edit=true`) and **no row at all** for `module_slug='collection'`. `collector` role's `collection` row is `can_view=true, can_create=true, can_edit=true`.
- **Blast radius of the `collection` module permission in code** (`grep -rln "\"collection\"" src/app/api src/lib | xargs grep -ln requireModulePermission`): 18 route files — the entire Collector surface (accounts list, case-file, checklist, downloads, move-of-payment × 3, account detail, briefings, contacts, DCR × 2, closed-accounts history, remedial-turnovers history, payments × 3, reminders). **Granting `remedial` a blanket `collection:view`/`collection:edit` role-module row would hand Remedial full Collector authority** — confirms the fix must be scoped to `document_slug = 'demand_letter'`, not a `collection` module grant.
- **`document_slug` distribution in `rendered_documents`** (live `GROUP BY`): `demand_letter` (module `collection`, 9 existing rows) is the only slug currently under `module='collection'` in this table. Scoping the new RLS branch by `document_slug`, not by widening the `module` grant, is the only choice that doesn't also expose any future non-demand-letter `collection`-module document to Remedial.
- **Established "accept Collector OR Remedial" pattern already shipped in this codebase** (`docs/revision-plans/feature-remedial-payment-processing.md`, Phase 2, status **Done 2026-08-13**; verified live in `src/app/api/collector/payments/route.ts:189-196`):
  ```ts
  const user = await requireAuth();
  const isCollector = await hasModulePermission("collection", "edit", user.id);
  const isRemedial = await hasModulePermission("remedial", "edit", user.id);
  if (!isCollector && !isRemedial) {
    throw new ForbiddenError("Missing 'edit' permission on module 'collection' or 'remedial'");
  }
  ```
  and the matching RLS shape on `payments` (`pg_policy` on `public.payments`, policy `payments_collector_insert`):
  ```sql
  is_super_admin()
  OR (has_module_permission('collection','edit') AND EXISTS (SELECT 1 FROM assignments a WHERE a.masterlist_id = payments.masterlist_id AND a.collector_user_id = auth.uid()))
  OR (has_module_permission('remedial','edit') AND EXISTS (SELECT 1 FROM assignments a WHERE a.masterlist_id = payments.masterlist_id AND a.remedial_user_id = auth.uid()))
  ```
  This plan reuses this exact shape rather than inventing a new authorization pattern.
- **`masterlist_ar_select` policy** (`pg_policy` on `public.masterlist`) — the precedent for scoping remedial ownership *including* the `remedial_flag` gate (not just `assignments.remedial_user_id` alone), which is what makes "only after turnover" correct:
  ```sql
  ... OR (EXISTS (SELECT 1 FROM assignments a WHERE a.masterlist_id = masterlist.id AND a.remedial_user_id = auth.uid() AND masterlist.remedial_flag = true))
  ```
- **Join path `rendered_documents` → `assignments`**: `rendered_documents.loan_application_id` (no `masterlist_id` column on this table) → `masterlist.loan_application_id = masterlist.id` (masterlist has both columns, confirmed via `information_schema.columns`) → `assignments.masterlist_id`. This join is exactly why "Collector already generated it, Remedial should see it on turnover" needs no data migration or copy step — both roles read the same row via the same `loan_application_id`, gated only by which ownership branch of the policy matches.
- **`assignments` schema**: `id, masterlist_id, collector_user_id, assigned_by, assigned_at, remedial_user_id, remedial_assigned_at` — confirms `remedial_user_id` exists and is the correct ownership column, populated at turnover time (per the existing turnover flow this plan does not touch).
- **Prior decision explicitly deferring this exact item** (`docs/revision-plans/feature-remedial-payment-processing.md:13`): "Scope explicitly narrowed to **payment processing only** — no demand letters, ... (those remain open questions/separate work per the earlier audit)." This plan is that deferred item; no conflict.
- **Test runner** (`package.json:10`): `"test": "node --import tsx --test \"src/lib/**/__tests__/*.mts\""` — only `.mts` files under `src/lib/**/__tests__/` execute.
- **Migration naming convention** (`ls supabase/migrations`, most recent): `YYYYMMDDHHMMSS_description.sql`.

## Audit findings

1. **Existing representation of "demand letter" is canonical and reused as-is.** `generateDemandLetter()` (`src/lib/documents/generators/demand-letter.ts:79-152`) is already role-agnostic — it takes `masterlistId`, `demandStage`, `actorId`; nothing inside it assumes Collector. No new generator is needed, only a new caller (route) and a new authorization path to it.
2. **Every writer of `rendered_documents` rows for demand letters:** only `generateDemandLetter()` → `renderAndStore()` (`render-store.ts:48`), called from the one Collector route (`src/app/api/collector/accounts/[id]/demand-letter/route.ts:32-37`). No other writer exists (grep confirmed `DemandLetterModal` has exactly two references in `src/`: its own definition and this one usage site).
3. **Every reader:** `listRenderedDocuments(supabase, applicationId, { slug: "demand_letter" })` (`render-store.ts:176-193`), called only from the same Collector route's GET handler. Because it queries by `loan_application_id` with no `module`/`generated_by` filter, once RLS permits Remedial to read `document_slug='demand_letter'` rows, the *same* call — reused verbatim in the new Remedial route — returns every letter on that account regardless of who (Collector or Remedial) generated it. This directly satisfies "if Collector already generated for that user, it should also be visible to Remedial."
4. **Component reuse pattern already established in this codebase.** `OriginationPacketPanel` (`src/components/collection/OriginationPacketPanel.tsx`) is already shared verbatim between Collector (`src/app/collector/accounts/[id]/loan-file/page.tsx:81-84`) and Remedial (`src/app/remedial/accounts/[id]/page.tsx:393-397`) via a `caseFileApiBase: string` prop each caller supplies with its own role-prefixed route. `DemandLetterModal` should follow the identical convention (an `apiBase` prop) rather than being duplicated as a second component.
5. **Variant support table:**

   | Variant | Currently supported? | Change needed |
   | --- | --- | --- |
   | Collector: view/generate demand letters | Yes | None |
   | Remedial: view letters Collector already generated, once turned over | No — RLS blocks it entirely (no `collection` grant) | New RLS branch + new route |
   | Remedial: generate new demand letters | No — same block, plus no UI entry point | New RLS branch + new route + new UI mount |
   | Remedial: account not yet turned over (`remedial_flag=false`) | N/A today | Must stay blocked — RLS branch requires `remedial_flag=true` |
   | Super admin: view/generate for any account | Yes (`is_super_admin()` short-circuits every relevant policy) | None |

---

## Scope and constraints

### In scope
- New RLS policy branch on `rendered_documents` (SELECT/INSERT/UPDATE) recognizing Remedial ownership, scoped to `document_slug = 'demand_letter'` and gated by `assignments.remedial_user_id = auth.uid() AND masterlist.remedial_flag = true` — i.e. access turns on exactly at turnover, using the same signal the rest of the app already uses for "this account is now Remedial's."
- New route `src/app/api/remedial/accounts/[id]/demand-letter/route.ts` (GET + POST), mirroring the Collector route but checking `remedial` module permission.
- Generalize `DemandLetterModal` into `src/components/collection/DemandLetterModal.tsx` with an `apiBase` prop; update Collector's usage to pass the prop explicitly.
- Mount the same button + modal on Remedial's account detail page (`src/app/remedial/accounts/[id]/page.tsx`), next to the existing "Origination packet" section.

### Out of scope: do not change
- No queue-level "missing 1st/2nd notice" indicator, no `demand_stage` column, no change to how a demand letter's stage is stored or displayed beyond what Collector's UI already shows — dropped per this session's narrowed scope.
- The 91-day aging-based turnover trigger (`remedial_turnovers`, `supabase/migrations/20260723085213_aging_90_day_remedial_threshold.sql`) — untouched; this plan only changes what Remedial can see/do *after* turnover, not when turnover happens.
- Collector's existing route, component, and RLS behavior for demand letters — must remain fully functional and untouched in shape (only an additional `OR` branch is added to each policy; the existing `collection` branch is not modified).
- Bounced-check ledger recording (UAT tracker item 2) and DCR allocation validation (item 1) — separate tracked items, separate plans.
- Any change to `document_templates` or the demand-letter PDF body/layout.
- Borrower-side visibility of demand letters — not requested, not touched.

### Non-negotiable safety constraints
- RLS change is additive only (new `OR` branch); no existing policy clause is removed or narrowed.
- The new Remedial branch is scoped by `document_slug = 'demand_letter'` and by `assignments.remedial_user_id = auth.uid() AND masterlist.remedial_flag = true` — never a blanket `collection` or `remedial` module grant that would expose other document types, other accounts, or pre-turnover accounts.
- No change to `is_finalized`/`signed_at` semantics — a Remedial-generated demand letter behaves identically to a Collector-generated one once stored.

### Contract

**`GET /api/remedial/accounts/[id]/demand-letter`** — returns `{ documents: RenderedDoc[] }`, each with `id, generatedAt, downloadUrl` (same shape as the Collector route today). **`POST`** — body `{ demandStage: "first_reminder"|"second_demand"|"final_demand", deadlineDays?: number }`, returns the created document result. Both require `remedial:view` / `remedial:edit` respectively (via `requireModulePermission("remedial", ...)`, mirroring the Collector route's single-module check — this route is Remedial-only, symmetric with the Collector-only route it mirrors, not a dual-module accept-either route).

| Case | Actor | Input | Required outcome |
| --- | --- | --- | --- |
| Happy path — view letters Collector already made | Remedial, account turned over to them (`remedial_flag=true`, `assignments.remedial_user_id` = them) | GET | 200, list includes every existing `demand_letter` row for that account, including ones generated earlier by Collector |
| Happy path — generate | Remedial, same account | POST `{demandStage: "first_reminder"}` | 200, new `rendered_documents` row, immediately visible to both Remedial and Collector on next GET (same row, same table) |
| Unauthorized role | Collector hitting the Remedial route directly, or vice versa | GET/POST | 403 via `requireModulePermission` (each role only has a grant on its own module) — Collector's own route is unaffected and keeps working via its existing `collection` check |
| Not yet turned over | Remedial user, account still with Collector (`remedial_flag=false`) | GET/POST | Blocked — `masterlist.remedial_flag = true` clause fails, even if a stale `assignments.remedial_user_id` row exists |
| Wrong Remedial officer | Remedial user, account turned over to a *different* Remedial officer | GET/POST | Blocked — `assignments.remedial_user_id = auth.uid()` fails for this row |
| Direct DB write bypassing the route | Any authenticated non-super-admin role, raw `supabase.from('rendered_documents').insert(...)` for an account not theirs | insert | Rejected by `rendered_documents_insert` RLS regardless of route-level checks — this is the actual security boundary, not the route |
| Invalid `demandStage` | Remedial | POST `{demandStage: "bogus"}` | 400 — Zod schema rejects (mirrors Collector route's `bodySchema`) |
| Collector still works unmodified | Collector, own assigned account | GET/POST via existing Collector route | Unchanged 200 behavior — existing RLS `collection` branch untouched |

## Files

| File | Change | Responsibility |
| --- | --- | --- |
| `supabase/migrations/<ts>_remedial_demand_letter_access.sql` | New migration: add Remedial RLS branch to `rendered_documents_select`/`_insert`/`_update` | Authorization |
| `src/app/api/remedial/accounts/[id]/demand-letter/route.ts` | New file, mirrors Collector's route with `requireModulePermission("remedial", ...)` | New Remedial route |
| `src/components/collector/DemandLetterModal.tsx` → `src/components/collection/DemandLetterModal.tsx` | Move + add `apiBase: string` prop, replace hardcoded `/api/collector/accounts/...` with `apiBase` | Shared, role-agnostic modal |
| `src/app/collector/accounts/page.tsx` | Update import path; pass `apiBase={\`/api/collector/accounts/${demandModalFor.id}/demand-letter\`}` | Keep Collector usage working |
| `src/app/remedial/accounts/[id]/page.tsx` | Add "Demand letters" section + trigger button + modal mount with `apiBase={\`/api/remedial/accounts/${account.id}/demand-letter\`}` | New Remedial UI entry point |
| `src/lib/documents/generators/__tests__/demand-letter.mts` | New test file | Baseline coverage that `generateDemandLetter` remains role-agnostic |

## Phase 0: Failing tests first

### Task 0.1: RLS branch is reachable by Remedial, not by an unrelated Remedial officer
**File:** No `.mts` unit test can exercise live RLS (it runs in Postgres, not in the app process) — this project's test runner (`package.json:10`) only executes `.mts` files under `src/lib/**/__tests__/`, and no existing test in this codebase exercises live RLS directly (confirmed: RLS verification in this project is done via manual/read-only SQL checks in the plan itself, as in Phase 1's verification query below, not via the `.mts` suite). So this phase's "failing test" is the **read-only verification query**, run before Phase 1's migration is applied, to establish the baseline:
- [ ] Run (read-only, before migration): `select polname, pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid) from pg_policy where polrelid = 'public.rendered_documents'::regclass order by polname;`
- [ ] Expected: 3 rows, none containing `remedial` or `document_slug = 'demand_letter'` — confirms the gap exists before Phase 1.

### Task 0.2: Unit coverage that `generateDemandLetter` takes no role-specific dependency
**File:** `src/lib/documents/generators/__tests__/demand-letter.mts` (new)
- [ ] Write a test asserting `buildDemandLetterContext` (already pure per its own docstring) produces the correct `demandStage` label for all three stages — a baseline confirming the generator itself has nothing Collector-specific to change.
- [ ] Run: `npm test`
- [ ] Expected: PASS today (this is a baseline/regression guard, not a new-behavior test — the actual new behavior, RLS + route, is verified via Phase 1/3's manual/SQL checks per this project's existing convention for RLS work).

## Phase 1: RLS — recognize Remedial ownership on turned-over accounts

### Task 1.1: Migration
**File:** `supabase/migrations/<ts>_remedial_demand_letter_access.sql`
- [ ] Forward SQL:
  ```sql
  drop policy if exists rendered_documents_select on public.rendered_documents;
  create policy rendered_documents_select on public.rendered_documents
    for select using (
      is_super_admin()
      or has_module_permission(module, 'view')
      or exists (
        select 1 from loan_applications la
        join borrowers b on b.id = la.borrower_id
        where la.id = rendered_documents.loan_application_id
          and b.user_id = auth.uid()
      )
      or (
        rendered_documents.document_slug = 'demand_letter'
        and has_module_permission('remedial', 'view')
        and exists (
          select 1 from masterlist m
          join assignments a on a.masterlist_id = m.id
          where m.loan_application_id = rendered_documents.loan_application_id
            and a.remedial_user_id = auth.uid()
            and m.remedial_flag = true
        )
      )
    );

  drop policy if exists rendered_documents_insert on public.rendered_documents;
  create policy rendered_documents_insert on public.rendered_documents
    for insert with check (
      is_super_admin()
      or has_module_permission(module, 'edit')
      or (
        rendered_documents.document_slug = 'demand_letter'
        and has_module_permission('remedial', 'edit')
        and exists (
          select 1 from masterlist m
          join assignments a on a.masterlist_id = m.id
          where m.loan_application_id = rendered_documents.loan_application_id
            and a.remedial_user_id = auth.uid()
            and m.remedial_flag = true
        )
      )
    );

  drop policy if exists rendered_documents_update on public.rendered_documents;
  create policy rendered_documents_update on public.rendered_documents
    for update using (
      is_finalized = false and (
        is_super_admin()
        or has_module_permission(module, 'edit')
        or (
          rendered_documents.document_slug = 'demand_letter'
          and has_module_permission('remedial', 'edit')
          and exists (
            select 1 from masterlist m
            join assignments a on a.masterlist_id = m.id
            where m.loan_application_id = rendered_documents.loan_application_id
              and a.remedial_user_id = auth.uid()
              and m.remedial_flag = true
          )
        )
      )
    )
    with check (is_finalized = false);
  ```
- [ ] Apply via the Supabase MCP `apply_migration` tool against project `acopcwlhkovssjnrqygk` (this project's `p8`-era and later migrations apply via the MCP, not `supabase db push`, per project convention).
- [ ] Read-only verification query after applying (same query as Task 0.1): expect all 3 policies to now include the new `document_slug = 'demand_letter'` remedial branch, with the existing `collection`/borrower branches byte-for-byte unchanged from the Task 0.1 baseline.

**Phase constraints:** This phase only adds an `OR` clause to each policy; the pre-existing clauses must match the Task 0.1 baseline verbatim.

## Phase 2: Remedial API route

### Task 2.1: New route
**File:** `src/app/api/remedial/accounts/[id]/demand-letter/route.ts` (new)
- [ ] Mirror `src/app/api/collector/accounts/[id]/demand-letter/route.ts` exactly, with two changes: `requireModulePermission("remedial", "edit")` in POST and `requireModulePermission("remedial", "view")` in GET (in place of `"collection"`), and `moduleSlug: "remedial"` in the `writeAuditEvent` call (mirrors the actor, per the convention already used in `src/app/api/collector/payments/route.ts`).
- [ ] `listRenderedDocuments`/`getRenderedDocumentDownloadUrl` calls are unchanged (already generic — take `applicationId`, not a role), so this route returns the exact same letters (Collector- or Remedial-generated) as the Collector route would for the same account.
- [ ] Run: `npx tsc --noEmit` → clean.
- [ ] Manual check: as a Collector, generate a `first_reminder` letter on an account, then turn that account over to Remedial (existing turnover flow, untouched by this plan). As the assigned Remedial officer, `GET` the new route → the Collector-generated letter appears in the list.
- [ ] Manual check: `POST` the new route as that Remedial officer with `{demandStage: "second_demand"}` → 200, new row appears; a subsequent `GET` on the *Collector* route for the same account (if the account somehow reverts, or via a super-admin check) shows both letters, confirming it's one shared table, not two.
- [ ] Manual check: as Remedial, GET/POST for an account assigned to a *different* Remedial officer → blocked (empty list / RLS rejection).
- [ ] Manual check: as Remedial, GET/POST for an account not yet turned over (`remedial_flag=false`) → blocked.

**Phase constraints:** Do not add a Collector fallback/dual-module check to this route — it is intentionally Remedial-only, symmetric with the Collector-only route it mirrors.

## Phase 3: Shared modal component

### Task 3.1: Generalize and relocate `DemandLetterModal`
**Files:** `src/components/collector/DemandLetterModal.tsx` → `src/components/collection/DemandLetterModal.tsx`, `src/app/collector/accounts/page.tsx`
- [ ] Move the file to `src/components/collection/`.
- [ ] Add `apiBase: string` to `DemandLetterModalProps`.
- [ ] Replace both hardcoded `` `/api/collector/accounts/${masterlistId}/demand-letter` `` occurrences (in `loadDocs` and `generate`) with `` `${apiBase}` ``.
- [ ] Update `src/app/collector/accounts/page.tsx`'s import path and add `apiBase={\`/api/collector/accounts/${demandModalFor.id}/demand-letter\`}` to its existing `<DemandLetterModal ... />` usage (`page.tsx:801-807`).
- [ ] Run: `npx tsc --noEmit` → clean.
- [ ] Manual check: Collector's existing "Demand letter" action on the accounts list still opens the modal and lists/generates letters exactly as before.

**Phase constraints:** No visual/behavioral change for Collector — this task is a pure refactor plus one new required prop.

### Task 3.2: Mount on Remedial's account detail page
**File:** `src/app/remedial/accounts/[id]/page.tsx`
- [ ] Add local state: `const [demandModalOpen, setDemandModalOpen] = useState(false);`
- [ ] Add a new section directly after the existing "Origination packet" section (after line 399), following the same `<section className="mb-8">` heading pattern used there:
  ```tsx
  {account ? (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-navy-900">
          Demand letters
        </h2>
        <Button variant="secondary" onClick={() => setDemandModalOpen(true)}>
          Demand letter
        </Button>
      </div>
      <DemandLetterModal
        open={demandModalOpen}
        borrowerName={account.borrowerName}
        apiBase={`/api/remedial/accounts/${account.id}/demand-letter`}
        onClose={() => setDemandModalOpen(false)}
      />
    </section>
  ) : null}
  ```
- [ ] Add the `Button` import if not already present on this page (check the existing `@/components/ui` import list at the top of the file); add `import { DemandLetterModal } from "@/components/collection/DemandLetterModal";`.
- [ ] Run: `npx tsc --noEmit` → clean.
- [ ] Manual check: as a Remedial officer, open a turned-over account, click "Demand letter," see any letters Collector already generated listed there, generate a new one, confirm it lists with a working download link.

**Phase constraints:** Match the same button label/placement style Collector uses, so the feature reads as "the same button," not a redesigned one, per the request.

## Phase last: Regression verification and rollout

- [ ] `npm test` — full suite, expect prior pass count plus the new Phase 0 baseline test, 0 fail.
- [ ] `npx tsc --noEmit` — clean.
- [ ] `npx eslint .` (or the project's existing lint script from `package.json`) — clean.
- [ ] `npm run build` — clean.
- [ ] Smoke-test table:

  | Role | Variant | Action | Expected |
  | --- | --- | --- | --- |
  | Collector | own assigned account | View/generate demand letter | Unchanged — works exactly as before Phase 1 |
  | Remedial | account just turned over, letters exist from Collector | Open "Demand letter" | Collector's letters are listed |
  | Remedial | same account | Generate a new letter | Appears in the list immediately |
  | Remedial | account assigned to another remedial officer | Open "Demand letter" | Blocked |
  | Remedial | account not yet turned over | Open "Demand letter" | Blocked (button may be present but the underlying route rejects — see note below) |
  | CSA/Committee/AR | any account | Hit `/api/remedial/accounts/[id]/demand-letter` directly | 403 — no `remedial` module grant |
  | Super admin | any account | View/generate demand letter | Works (unaffected by scoping, per `is_super_admin()` short-circuit) |

  Note on the "not yet turned over" row: Remedial's account detail page (`src/app/remedial/accounts/[id]/page.tsx`) only renders for accounts already in that officer's turned-over queue (existing page-level access control, unchanged by this plan), so the button is not reachable pre-turnover through the normal UI. The RLS block is the actual guarantee, per the Contract table's "Direct DB write" row.

## Rollback

1. If Phase 1's migration causes unexpected RLS behavior for Collector: revert via a new forward migration that drops the added `OR` branch from all three policies (re-run Task 1.1's `create policy` blocks with the branch removed) — never edit the applied migration file itself.
2. Any demand letters generated by Remedial during the rollout window remain valid `rendered_documents` rows (identical shape to Collector-generated ones) even if Remedial's write access is later revoked by a rollback — only future writes are blocked again, existing rows are not deleted.
3. Frontend changes (Phases 2–3) can be reverted independently of the DB migration by reverting those commits; the DB migration does not need to be rolled back just to remove the UI.

## Commit

```
git add supabase/migrations/<ts>_remedial_demand_letter_access.sql \
        src/app/api/remedial/accounts/[id]/demand-letter/route.ts \
        src/components/collection/DemandLetterModal.tsx \
        src/app/collector/accounts/page.tsx \
        src/app/remedial/accounts/[id]/page.tsx \
        src/lib/documents/generators/__tests__/demand-letter.mts
```
(`git rm` the old path `src/components/collector/DemandLetterModal.tsx` as part of the same commit, since Task 3.1 moves rather than copies it.)

Message: `feat(remedial): give Remedial the same Demand Letter button as Collector on turned-over accounts`

## Self-review

1. **Contradictions:** "In scope" claims `document_slug`-scoped access, not a `collection` module grant; Live validation independently confirms a `collection` grant would leak 18 unrelated Collector routes' worth of authority. "Out of scope" explicitly drops the queue-flag/`demand_stage` work from the previous version of this plan, and nothing else in this plan references either — no leftover contradiction.
2. **Goal reachability:** For existing letters (Collector-generated, pre-dating this change), the Contract table and Phase 2's manual check explicitly verify they become visible to Remedial the moment RLS permits it — no copy/backfill needed since both roles read the same `rendered_documents` rows. For future letters created by either role via `generateDemandLetter`, both routes call the same function — reachable for both creation paths.
3. **Bypass:** Checked direct-DB-write case explicitly in the Contract table — RLS (not the route's `requireModulePermission` call) is the actual boundary, and the new policy branch requires both `has_module_permission('remedial','edit')` and the `assignments`/`remedial_flag` join, so a Remedial user cannot reach accounts not turned over to them even via a raw Supabase call.
4. **Existence:** Every file path, function name, column, and policy name in this plan was read or queried live in this session (see Live database/system validation and Audit findings citations) — nothing named was guessed.
5. **Consistency:** Files table lists 6 files/paths; Phase task file lists match; Commit's `git add` list matches the Files table exactly (including the `git rm` note for the moved file).
6. **Duplication:** Explicitly avoided creating a second demand-letter component or a second generator function — Task 3.1 moves (not copies) the modal, and Phase 2 reuses `generateDemandLetter`/`listRenderedDocuments`/`getRenderedDocumentDownloadUrl` unchanged.
7. **Placeholders:** `<ts>` in the migration filename is a standard convention placeholder (the actual timestamp is generated at migration-creation time per this project's own naming pattern) — no other `TODO`/`TBD`/`<...>` remains.

**Audit-checklist sections not applicable:** "Explain every data anomaly" — no anomalous live data was found for this feature (9 existing demand-letter rows, no duplicates/orphans). "Per-variant enumeration" for stage tracking is no longer applicable — this version of the plan deliberately does not distinguish stages beyond what Collector's existing UI already shows, per the narrowed scope.
