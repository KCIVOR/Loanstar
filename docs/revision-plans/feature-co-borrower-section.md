# Feature — Co-Borrower section on the application form (Aug 25 2026 tracker, Feature #3)

**Requirements source:** [implementation-tracker-2026-08-25.md](../implementation-tracker-2026-08-25.md) Feature #3, confirmed against `transcription-2026-08-25.md` lines 286–313 and `transcription.md` lines 292–337, plus `meeting-minutes-2026-08-25.md` lines 140, 245–247, and the Rovick decision of 2026-09-01 (seafarer exclusion).

**Status:** Plan only. No code written yet.

---

## Constraints for whoever implements this (read before touching anything)

- **Touch only what each phase's *Files to change* line names.** If you find a related spot not listed, stop and flag it — do not edit it, do not "clean up" adjacent code.
- **Additive schema only.** This plan adds columns to `loan_applications` (`co_borrower_required`, `co_borrowers`, and two audit-stamp columns). **No existing column's meaning changes.** Everything currently reading `loan_applications` keeps working untouched.
- **Do not touch the negotiation / disclosure / release state machine.** `discloseTerms`, `witnessSignComputation`, `completeRevision`, `queueForLra`, `executeFinalAction`'s vote/tally logic, `negotiations` rows, `src/lib/lra/release-service.ts`, `blockers.ts` — **none of them change.** The co-borrower requirement is **advisory only** (Rovick decision, 2026-09-01): it never blocks a status transition or a release. The only edit anywhere near this area is **one added line in `executeFinalAction`'s existing `approve` branch** (Phase 2). Nothing else in `src/lib/negotiation/`, `src/lib/lra/`, or `src/lib/committee/actions.ts` changes.
- **Do not set `loan_applications.blocker`.** `blocker` feeds bottleneck / TAT reports ([reports/bottlenecks/sources.ts](../../src/lib/reports/bottlenecks/sources.ts)) and reads as a hard hold. A missing co-borrower is not a hold — it must not pollute those metrics. The requirement is surfaced purely by the `co_borrower_required` flag driving UI captions and the LRA banner (Phase 6).
- **Do not reuse the "revisit" mechanism.** Notice-to-Revisit sets `for_revision` and returns the file to `for_approval` for a re-vote (`completeRevision`, [negotiation/service.ts:861](../../src/lib/negotiation/service.ts:861)). The co-borrower requirement is explicitly **not** a re-vote — it is a note attached to an approval, filled (or not) after approval, with the file released normally without going back through CIG or Committee (transcript: *"hindi na po siya dadaan naman ng CIG… direct kay LRA kasi may approval na rin"*). Keep these two flows completely separate.
- **No RLS policy changes.** The post-approval co-borrower write is a privileged workflow side-effect blocked by RLS for the `intake` role at `approved`/`awaiting_confirmation` status (confirmed: no `loan_applications` UPDATE policy grants `intake` write access outside `is_csa_editable_status`). Use the **service client after an explicit permission + ownership check**, the exact pattern `queueForLra` ([negotiation/service.ts:608](../../src/lib/negotiation/service.ts:608)) and `completeRevision` already use. Do not add a new `pg_policies` row.
- **Seafarer is excluded everywhere.** Rovick's explicit decision (2026-09-01). Enforce it in three places (Phase 2 route guard, Phase 3 UI, Phase 5 UI) so no single missed check exposes it.
- **After every phase:** `npx tsc --noEmit -p .` and `npm test` from `loanstar/`, both clean, before the next phase.
- **Final step (all phases done):** one combined summary — every file touched, every migration, final test count — for a validation pass against this document and a real `git status`/diff.

---

## Audit findings (verified 2026-09-01 against the live DB and codebase)

### What exists

- **Borrower profile data** lives on `borrowers` (JSONB columns: `present_address`, `financial`, `dependents`, `references_data`, `business_info`, `profile_data`, …). The shared editor is [`ApplicantProfileFields.tsx`](../../src/components/borrowers/ApplicantProfileFields.tsx), used by the borrower portal, CSA, CIG, Committee, and the Collection origination packet. **Co-borrower does not belong here** — it is per-loan-decision, not a durable borrower attribute, and a reloan of the same borrower may not need one.
- **`loan_applications`** carries no profile JSONB today — only segment/type/status/workflow-stamp columns ([DB `information_schema.columns`](#), confirmed). This is where per-application co-borrower data belongs.
- **Central application fetch:** [`getApplicationForStaff`](../../src/lib/csa/application.ts:45) — an **explicit column list** (not `select *`). CSA GET route, the Committee action route, and others read through it. New columns must be added to this list to surface anywhere.
- **CSA edit route:** [`PATCH /api/csa/applications/[id]`](../../src/app/api/csa/applications/[id]/route.ts) — `patchSchema` has `borrower` (→ `borrowers` via `borrowerProfileToRow`) and `details` (→ `application_details`). It **does not write `loan_applications` at all**, and is gated by `assertCsaCanEdit` → `isCsaEditableStatus` ([csa/status.ts:2](../../src/lib/csa/status.ts:2): `registered, documents_pending, submitted, on_hold, for_revision`). Not usable post-approval.
- **CSA endorse route:** [`POST /api/csa/applications/[id]/endorse`](../../src/app/api/csa/applications/[id]/endorse/route.ts) — always transitions to `for_verification` (CIG). There is no existing "skip CIG" path; the co-borrower flow does not use endorse at all.
- **Committee decision:** [`executeFinalAction`](../../src/lib/committee/actions.ts:136) — `approve|deny|revisit|hold`. `approve` → status `approved`, upserts a `negotiations` row (`status: pending_disclosure`), clears `blocker` ([:185-190](../../src/lib/committee/actions.ts:185)). Route: [`POST /api/committee/applications/[id]/action`](../../src/app/api/committee/applications/[id]/action/route.ts), `actionSchema` = `{ action, comment?, revisitRoute? }`.
- **Approval → release path:** `approve` → `discloseTerms` (→ `awaiting_confirmation`) → borrower sign **or** `witnessSignComputation` → `queueForLra` ([negotiation/service.ts:608](../../src/lib/negotiation/service.ts:608)) → `release_queue` upsert + status `lra_pending`. This path is **not modified** — the co-borrower requirement is advisory and never gates it.
- **Blocker:** `loan_applications.blocker` (text, nullable) is surfaced on every staff header and also feeds bottleneck/TAT reports — deliberately **not** used by this feature (see Constraints).
- **Documents:** [`buildApplicationFormContext`](../../src/lib/documents/generators/application-form-context.ts:129) hardcodes `coBorrowerName: ""` ([:153](../../src/lib/documents/generators/application-form-context.ts:153)). The template merge-field catalog already reserves `coBorrowerName` and the `hasCoBorrower` flag ([templates/fields.ts:39](../../src/lib/documents/templates/fields.ts:39), [:374](../../src/lib/documents/templates/fields.ts:374)) — they render blank/false only because the context never populates them. There is **no standalone promissory-note generator** in this codebase (generators: application-form, acknowledgement-receipt, demand-letter, final-computation-sheet); the PN is a superadmin-managed template that consumes the same context keys.

### RLS reality (live `pg_policies`, `loan_applications`, UPDATE)

- `applications_update` — `intake.edit` may update **only** while `is_csa_editable_status(status)`.
- `applications_negotiation_update` — `negotiation.edit` may update at `approved`/`negotiating_terms`/`awaiting_confirmation`.
- **No policy** lets `intake` (CSA) write `loan_applications` at `approved`+. → the post-approval co-borrower write **must** go through the service client after a manual permission + ownership check (see Constraints).

---

## Data model decision

Co-borrower data is **per-application**, minimal, and repeatable:

```sql
alter table public.loan_applications
  add column co_borrower_required boolean not null default false,
  add column co_borrowers jsonb not null default '[]'::jsonb,
  add column co_borrower_required_by uuid,   -- bare uuid, no FK: matches endorsed_by / privacy_orientation_by / initial_interview_by on this table
  add column co_borrower_completed_at timestamptz;
```

- `co_borrowers` shape: `[{ "fullName": string, "address": string }]` — name + address only (transcript: *"pangalan lang naman niya at address"*). Multiple allowed (*"pwede yung madami din"*).
- `co_borrower_required` — set true by Committee at approval time (Phase 2). Never auto-set. This is the *only* signal that drives every UI caption and the LRA banner.
- `co_borrower_completed_at` — stamped when `co_borrowers` first becomes non-empty; lets the LRA banner distinguish "required and still missing" from "required and done". Attribution of *who* filled it is covered by `audit_events` (Phase 4), so no `_completed_by` column is needed.
- Backfill: every existing row gets `co_borrower_required = false`, `co_borrowers = []` — inert, nothing downstream changes.

---

## Phase 0 — Schema

**Goal:** add the four columns. Nothing else.

**Files to change:**
- New migration `+ two-folder copy` (per the standing `loanstar/supabase/migrations/` **and** `supabase/migrations/` gotcha) — the `alter table` above. Apply to the live DB via the Supabase MCP `apply_migration` (not `db push`).

**Out of scope:** any application code.

**Done when:** the four columns exist on the live DB (`information_schema.columns`); every existing `loan_applications` row has `co_borrower_required = false` and `co_borrowers = '[]'`; full suite still green (schema-only).

### Status: DONE (2026-09-01)

- Migration `loanstar/supabase/migrations/20260901050000_co_borrower_section_schema.sql`, applied live via Supabase MCP `apply_migration` (tracked as `co_borrower_section_schema`). Only the active `loanstar/supabase/migrations/` folder was used — the stale repo-root `supabase/migrations/` has not received a migration since 2026-08-28 and is no longer part of the workflow.
- Verified live: all four columns present with the right types/defaults; all 100 existing `loan_applications` rows have `co_borrower_required = false`, `co_borrowers = '[]'`, both new nullable columns `null`.
- No generated Supabase types file exists in this repo, so nothing to regenerate.
- `npm test` → **1490 pass / 0 fail** (was 1490 before; schema-only, no code touched). `tsc --noEmit` shows only the ~20 pre-existing unrelated `__tests__` errors (vitest-module resolution etc.) — unchanged, this phase added no TypeScript.
- One deviation from the sketch above: `co_borrower_required_by` was created as a bare `uuid` with no FK, to match the existing `endorsed_by` / `privacy_orientation_by` / `initial_interview_by` / `agent_user_id` columns on this same table (confirmed: `loan_applications` has FKs only on `borrower_id` and `parent_application_id`). Plan sketch updated to match.

---

## Phase 1 — Read path: surface the columns everywhere they're already read

**Goal:** the new fields flow into the CSA, Committee, and LRA application views without any behavior change yet.

**Files to change:**
- [`src/lib/csa/application.ts`](../../src/lib/csa/application.ts:51) — add `co_borrower_required, co_borrowers, co_borrower_required_by, co_borrower_completed_at` to `getApplicationForStaff`'s explicit `select` list (top-level `loan_applications` block, alongside `blocker`).
- [`src/app/api/csa/applications/[id]/route.ts`](../../src/app/api/csa/applications/[id]/route.ts) — in the `GET` response's `application` object, pass through `coBorrowerRequired: application.co_borrower_required` and `coBorrowers: application.co_borrowers ?? []`.
- [`src/lib/csa/application.ts`](../../src/lib/csa/application.ts) — if a shared `StaffApplication`/response TS type exists here, extend it; otherwise add the two fields to whatever local response type the CSA route's GET builds. (Locate the exact type first — not fully traced in planning.)
- Committee application detail API/loader and LRA application detail loader — locate the equivalent response-shaping spots (both ultimately read `getApplicationForStaff` or a sibling select) and thread the same two fields through. **Read each loader fully before editing; add fields to the output object only, touch nothing else.**

**Out of scope:** any UI, any write path, any validation.

**Done when:** the CSA, Committee, and LRA detail API responses each include `coBorrowerRequired` and `coBorrowers`; nothing renders them yet; full suite green.

### Status: DONE (2026-09-01)

- **[`src/lib/csa/application.ts`](../../src/lib/csa/application.ts)** — `getApplicationForStaff`'s explicit `select` now lists `co_borrower_required, co_borrowers, co_borrower_required_by, co_borrower_completed_at` right after `blocker`. This one select feeds **both** the CSA and Committee detail routes.
- **[`src/app/api/csa/applications/[id]/route.ts`](../../src/app/api/csa/applications/[id]/route.ts)** GET — `application` object gains `coBorrowerRequired: application.co_borrower_required === true` and `coBorrowers` (a shape-guarded `Array<{ fullName; address }>`, defaulting to `[]`).
- **[`src/app/api/committee/applications/[id]/route.ts`](../../src/app/api/committee/applications/[id]/route.ts)** GET — same two fields added to its `application` object (it already uses `getApplicationForStaff`).
- **[`src/app/api/lra/applications/[id]/route.ts`](../../src/app/api/lra/applications/[id]/route.ts)** GET — this route has its **own** narrow `loan_applications` select (not `getApplicationForStaff`); added `co_borrower_required, co_borrowers, co_borrower_completed_at` to it, and `coBorrowerRequired` / `coBorrowers` / `coBorrowerCompletedAt` to the `application` object. (`coBorrowerCompletedAt` is returned for potential "provided on <date>" text; Phase 6's `coBorrowerBannerState` ended up **not** needing it — it keys purely off `coBorrowers.length` — so it's carried but unused for now.)
- No shared/exported response TS type exists for any of these routes (all build inline object literals via `jsonOk`) — nothing to extend. No generated Supabase types to regen.
- **Verification:** `tsc --noEmit` — no new errors (20 pre-existing unrelated, unchanged); `npm test` → **1490 pass / 0 fail**. Live: the four columns select cleanly on real rows via the same shape.

---

## Phase 2 — Committee: "require co-borrower" as an approval condition (backend)

**Goal:** Committee can approve a loan **with** a co-borrower note attached, in one action. It sets one flag; it does **not** change the approve flow, the vote logic, the status target, or `blocker`.

**Files to change:**
- [`src/lib/committee/actions.ts`](../../src/lib/committee/actions.ts) — `executeFinalAction`'s `options` type gains `requireCoBorrower?: boolean`. In the **existing `approve` branch only** ([:192-215](../../src/lib/committee/actions.ts:192)), after the `negotiations` upsert:
  - if `options.requireCoBorrower === true`:
    - reject with a clear error if `application.segment === "seafarer"` (**guard #1 of 3**);
    - `update loan_applications set co_borrower_required = true, co_borrower_required_by = <actorId> where id = <applicationId>`. **Do not touch `blocker`** (see Constraints) — the unconditional `update({ blocker: null })` at [:185-190](../../src/lib/committee/actions.ts:185) is left exactly as-is.
- [`src/app/api/committee/applications/[id]/action/route.ts`](../../src/app/api/committee/applications/[id]/action/route.ts) — add `requireCoBorrower: z.boolean().optional()` to `actionSchema`; pass it into `executeFinalAction`'s options. No other change (the `deny`/`revisit` email branches are untouched).
- `writeAuditEvent` in `executeFinalAction` already fires for every action — extend its `afterData` to include `requireCoBorrower` when set. No new audit call.

**Out of scope:** the `discloseTerms` / sign / `queueForLra` / release flow — none of it is gated. The Committee UI (Phase 3). Any `deny`/`revisit`/`hold` path.

**Done when:** `POST …/action { action: "approve", requireCoBorrower: true }` on a non-seafarer app → status `approved`, `co_borrower_required = true`, `blocker` still `null`, `negotiations` row created exactly as before; the same call on a seafarer app is rejected; a plain `{ action: "approve" }` behaves byte-for-byte as it does today; full suite green.

### Status: DONE (2026-09-01)

- **[`src/lib/committee/actions.ts`](../../src/lib/committee/actions.ts)** — `executeFinalAction`'s `options` type gains `requireCoBorrower?: boolean` (documented inline). Split into two parts:
  - **Seafarer rejection** — right after `assertFinalActionPreconditions` (fail fast, before any side effect): throw if `action === "approve" && requireCoBorrower` and the segment is disallowed. *(Phase 8 extracted the segment check to a pure `assertCoBorrowerRequirementAllowed(segment)` in `lib/applications/co-borrower.ts` for unit-testability; behaviour and error string unchanged.)*
  - **The flag write** — after `assertAllVotesCast` / `computeVoteTally` but **before** the `committee_actions` insert and `appendStatusHistory`: `update loan_applications set co_borrower_required = true, co_borrower_required_by = <actorId>` with `.select("id").maybeSingle()` and a "no row updated (RLS or missing application)" throw on 0 rows.
  - **Placement rationale (deviates from the plan sketch, which said "after the negotiations upsert"):**
    - Not *after* `appendStatusHistory`: that call moves the row to `status = 'approved'`, and the `applications_committee_action` RLS policy's USING clause only permits a committee `loan_applications` UPDATE while status is `for_approval`/`negotiating_terms`/`committee_hold`. A post-transition write would silently update 0 rows for any non-superadmin committee user (the same reason the pre-existing `update({ blocker: null })` right there is effectively a no-op under RLS). The `if (!coBorrowerRow) throw` guard would surface that, but it's better to just write it in the valid window.
    - Not *before* `assertAllVotesCast` either (refined during the 0/1/2 consistency review): otherwise a `requireCoBorrower` call that then fails the vote check would leave `co_borrower_required = true` on an application that was never approved. Writing it *after* the vote check closes that window. `blocker` is still never touched.
  - `writeAuditEvent`'s `afterData` now includes `requireCoBorrower: true` when set (no new audit call).
  - `assertFinalActionPreconditions`'s own signature left unchanged — it never inspects this option and TS allows the wider `options` object through.
- **[`src/app/api/committee/applications/[id]/action/route.ts`](../../src/app/api/committee/applications/[id]/action/route.ts)** — `actionSchema` gains `requireCoBorrower: z.boolean().optional()`; threaded into `executeFinalAction`'s options. `deny`/`revisit` branches untouched.
- **Verification:** `tsc --noEmit` — no new errors (20 pre-existing unrelated, unchanged); `npm test` → **1490 pass / 0 fail** (unchanged). Functional/live check of the approve path is deferred to Phase 8 (tests) and Phase 9 (manual walkthrough), matching the plan's sequencing.
- **Note:** implemented before Phase 1 but does not depend on it (`executeFinalAction` reads `loan_applications` with its own `select`). Phase 1 has since landed, so the API responses now carry `coBorrowerRequired`/`coBorrowers`; the *pages* still won't render them until Phase 3/5/6.

---

## Phase 3 — Committee UI: the checkbox

**Goal:** a "Require a co-borrower before release" checkbox in the Committee decision panel, on the **Approve** path only, hidden for seafarer.

**Files to change — [`src/app/committee/applications/[id]/page.tsx`](../../src/app/committee/applications/[id]/page.tsx) only:**
- New state `const [requireCoBorrower, setRequireCoBorrower] = useState(false);` next to the existing `revisitRoute` state ([:412](../../src/app/committee/applications/[id]/page.tsx:412)).
- Render the checkbox only in the Approve action's confirm UI and only when `application.segment !== "seafarer"` (**guard #2 of 3**). Match the existing decision-panel control styling (reuse the `Label` + input pattern already used for `revisitRoute` at [:2436](../../src/app/committee/applications/[id]/page.tsx:2436)).
- When Approve is submitted, add `requireCoBorrower` to the payload (mirror how `payload.revisitRoute` is conditionally attached at [:505](../../src/app/committee/applications/[id]/page.tsx:505)).
- If `application.coBorrowerRequired` is already true (re-opening a decided app), show a static "Co-borrower required" note instead of the checkbox.

**Out of scope:** the co-borrower editor itself (Phase 4/5) — this phase only lets Committee *set the requirement*.

**Done when:** approving a non-seafarer app with the box ticked round-trips to Phase 2's backend; the box never appears for seafarer; unticked approve is unchanged; full suite green.

### Status: DONE (2026-09-01)

- **[`src/app/committee/applications/[id]/page.tsx`](../../src/app/committee/applications/[id]/page.tsx)** only:
  - `Checkbox` added to the `@/components/ui` import; `coBorrowerRequired: boolean` added to the local `CommitteeDetail.application` type (Phase 1 already sends it).
  - New state `requireCoBorrower` (default `false`), declared next to `revisitRoute`.
  - `handleAction`: `payload` type widened to `Record<string, string | boolean>`; `if (action === "approve" && requireCoBorrower) payload.requireCoBorrower = true` — mirrors the conditional `payload.revisitRoute` pattern. Reset to `false` on success and on the Approve dialog's `onCancel`.
  - UI: inside the existing Approve/Deny/Hold `ConfirmDialog`, after the Remarks `Textarea`, a block shown only when `confirmAction === "approve" && segment !== "seafarer"` (**guard #2 of 3**). If `coBorrowerRequired` is already true → a static "already required" line; otherwise the `Checkbox` ("Require a co-borrower before release", advisory-only description).
- **Scope note:** the separate "Approve without borrower's sign" fast-track (`approveDiscloseAndWitnessSign` / `/approve-without-sign`) gets **no** checkbox — matches Phase 2, whose `approveDiscloseAndWitnessSign` option type never carried `requireCoBorrower`. If a co-borrower is needed on a walk-in fast-track approval, CSA can still add it post-approval via Phase 4's route (the flag just wasn't set at decision time).
- **Verification:** `tsc --noEmit` — no new errors (20 pre-existing, unchanged); `npm test` → **1490 pass / 0 fail**. `eslint` on the changed file → the only error is a **pre-existing** `void load()`-in-`useEffect` at line 471, not in this diff; the Phase 3 additions introduce zero lint errors. Live click-through (needs a committee login + an app in `for_approval` with full votes) is deferred to Phase 9's walkthrough, consistent with Phases 0–2.

---

## Phase 4 — The co-borrower editor: dedicated write route + component

**Goal:** CSA (and Committee) can add/edit/remove co-borrower rows on an application that has `co_borrower_required = true`, both before and after approval, without an RLS change and without touching the CSA PATCH hot path.

**Files to change:**
- **New file `src/app/api/applications/[id]/co-borrowers/route.ts`** (`PATCH`):
  - `requireModulePermission` — accept the caller if they hold **`intake.edit`** OR **`committee.execute_trigger`** (locate the helper that checks "any of these permissions"; if none exists, two sequential `try/catch` checks are fine — do not build a generic abstraction).
  - Body: `z.object({ coBorrowers: z.array(z.object({ fullName: z.string().trim().min(1), address: z.string().trim().min(1) })).max(10) })`.
  - Load the application via `getApplicationForStaff` (ownership/existence check it already does).
  - Reject if `segment === "seafarer"` (**guard #3 of 3**).
  - Reject if `co_borrower_required !== true` ("This application does not require a co-borrower").
  - Reject if `status` not in `['registered','documents_pending','submitted','on_hold','for_revision','approved','awaiting_confirmation','negotiating_terms']` — i.e. never editable once the file is at `lra_pending`+ (by then it's locked for release).
  - Write with the **service client** (`createServiceClient()`): `update loan_applications set co_borrowers = <body>, co_borrower_completed_at = case when <body> non-empty and co_borrower_completed_at is null then now() else co_borrower_completed_at end where id = <id>`. **Never touches `blocker`.**
  - `writeAuditEvent({ moduleSlug: "intake", action: "update", entityType: "loan_application", entityId: id, beforeData: { coBorrowers: <old> }, afterData: { coBorrowers: <new> } })` — before/after snapshots, matching the [borrower/profile route](../../src/app/api/borrower/profile/route.ts:184) pattern.
- **New file `src/components/applications/CoBorrowerSection.tsx`:**
  - Props: `{ applicationId, coBorrowers, editable, onSaved }`.
  - Repeatable rows (`fullName`, `address`), "+ Add co-borrower" and per-row remove — mirror the add/remove row pattern already in `ComputationPanel.tsx`'s Other-Loan rows (do not invent a new one).
  - `editable === false` → read-only list (used by LRA, Phase 8, and any post-lock view).
  - Save → `PATCH /api/applications/${applicationId}/co-borrowers`, then `onSaved()`.

**Out of scope:** wiring the component into pages (Phase 5). The `queueForLra` gate (Phase 6).

**Done when:** the route writes `co_borrowers`, stamps `co_borrower_completed_at` once, and refuses seafarer / not-required / wrong-status / bad-permission calls; the component renders and round-trips in isolation; `blocker` is never written; full suite green.

### Status: DONE (2026-09-01)

- **New `src/lib/applications/co-borrower.ts`** (pure, no server deps — importable by client + unit-testable, as Phase 8 wants):
  - `CoBorrower` type; `CO_BORROWER_EDITABLE_STATUSES` + `isCoBorrowerEditableStatus`.
  - `assertCanEditCoBorrowers({ segment, coBorrowerRequired, status })` → `{ ok: true } | { ok: false, reason }` — the three rejections (seafarer / not-required / locked status).
  - `normalizeCoBorrowers(raw)` — trims, drops malformed entries; used on both read and write sides.
- **New `src/app/api/applications/[id]/co-borrowers/route.ts`** (`PATCH`):
  - Permission: `requireAuth()` then `hasModulePermission("intake","edit")` **OR** `hasModulePermission("committee","execute_trigger")`, else `ForbiddenError` (403). No "any-of" helper exists, so a `Promise.all` of two checks.
  - Body `z.object({ coBorrowers: z.array({ fullName: min(1), address: min(1) }).max(10) })`; `z.ZodError` → 400 (matches the `borrower/profile` route's catch pattern).
  - `getApplicationForStaff(supabase, id)` doubles as the visibility/ownership check (throws `ForbiddenError` if the caller can't see it).
  - `assertCanEditCoBorrowers(...)` → `ValidationError` (400) on any rejection.
  - Write via `createServiceClient()` (the `intake` role has no `loan_applications` UPDATE grant past `is_csa_editable_status` — same reason `queueForLra`/`completeRevision` use service role): sets `co_borrowers`, stamps `co_borrower_completed_at` only on the first non-empty save (kept forever after, even if later emptied). **Never touches `blocker`.**
  - `writeAuditEvent` with `beforeData`/`afterData` `{ coBorrowers }` (normalized snapshots).
  - Returns `{ coBorrowers, coBorrowerCompletedAt }`.
- **New `src/components/applications/CoBorrowerSection.tsx`** (`"use client"`):
  - Props `{ applicationId, coBorrowers, editable, onSaved? }`.
  - `editable === false` → read-only list straight from the `coBorrowers` prop ("No co-borrower on file." when empty).
  - `editable === true` → local draft rows (seeded once via `useState` initializer; re-seeded from the server response in the save handler — **no effect**, so no `react-hooks/set-state-in-effect`), per-row Full name / Address `Input`s, "Remove" per row, "+ Add co-borrower", "Save co-borrowers" (loading), `Alert` on error / success. Empty rows are filtered out before PATCH.
- **Deviation from the plan sketch:** the component does not literally copy `ComputationPanel.tsx`'s Other-Loan modal pattern — that one is a `Modal` with Cancel/Apply. An inline add/remove list is the right fit for a section embedded directly in a page (Phase 5), and still "does not invent a new visual language" (plain `Input` + `Button` rows, same as `ApplicantProfileFields`' dependents/references).
- **Verification:** `tsc` — no new errors (20 baseline); `eslint` on all three new files — clean; `npm test` → **1490 pass / 0 fail**; a throwaway `node --import tsx` smoke test of `assertCanEditCoBorrowers` / `normalizeCoBorrowers` / `isCoBorrowerEditableStatus` — 9/9 expected results. Route round-trip through a browser is deferred to Phase 9.

---

## Phase 5 — Wire the section into the CSA and Committee application pages

**Goal:** the co-borrower editor appears where staff actually work the file.

**Files to change:**
- [`src/app/csa/applications/[id]/page.tsx`](../../src/app/csa/applications/[id]/page.tsx) — render `<CoBorrowerSection>` in the application-form area (near the `ApplicantProfileFields` block at [:966](../../src/app/csa/applications/[id]/page.tsx:966)) **only when** `application.coBorrowerRequired && application.segment !== "seafarer"`. `editable` = `application.coBorrowerRequired` AND status is in Phase 4's allowlist. `onSaved` = the page's existing silent reload.
- [`src/app/committee/applications/[id]/page.tsx`](../../src/app/committee/applications/[id]/page.tsx) — same, near its `ApplicantProfileFields` block ([:951](../../src/app/committee/applications/[id]/page.tsx:951)); `editable` true for Committee whenever `coBorrowerRequired` and status ≤ `awaiting_confirmation`.
- When `coBorrowerRequired` is true but `coBorrowers` is empty, show the section with a "Requested by Committee — not yet provided" caption so it reads as an open (but non-blocking) task.

**Out of scope:** LRA page (Phase 6). CIG page — CIG is bypassed for this flow and gets no editor; if a co-borrower-required file is ever viewed in CIG, the existing read-only profile view is sufficient.

**Done when:** a co-borrower-required application shows an editable section for CSA and Committee, hidden entirely for seafarer and for applications with no requirement; saving reloads the page and the rows persist; full suite green.

### Status: DONE (2026-09-01)

- **[`src/app/csa/applications/[id]/page.tsx`](../../src/app/csa/applications/[id]/page.tsx)** and **[`src/app/committee/applications/[id]/page.tsx`](../../src/app/committee/applications/[id]/page.tsx)** — both:
  - import `CoBorrowerSection` + `isCoBorrowerEditableStatus` + `type CoBorrower`;
  - add `coBorrowerRequired: boolean` and `coBorrowers: CoBorrower[]` to the local response type (CSA had neither; Committee had `coBorrowerRequired` from Phase 3, added `coBorrowers`);
  - render a standalone `<Card>` **only when** `coBorrowerRequired && segment !== "seafarer"` (**guard #3 of 3**), placed right after the "Application Form" `Modal` block, before the next card ("Data Privacy Act orientation" on CSA, "Completeness review" on Committee) — i.e. as its own visible task, not buried inside the modal;
  - caption switches on `coBorrowers.length === 0` ("requested — not yet provided") vs. non-empty;
  - `editable={isCoBorrowerEditableStatus(status)}` — **not** the page's own `editable`/`isCsaEditableStatus`, which stops at `for_revision` and would wrongly lock the section once the app is `approved` (exactly when CSA needs to fill it). `isCoBorrowerEditableStatus` matches the Phase 4 route's own allowlist, so UI and server agree.
  - `onSaved={() => void load({ silent: true })}` — the existing silent reload on both pages.
- **CIG page:** untouched, per plan (CIG is bypassed for this flow).
- **Verification:** `tsc` — zero errors in any co-borrower file or either page (the run's total drifted 20→28 purely from a *concurrent* session editing `AccountLedger.tsx` + test files — none mine). `eslint` — the only errors on the two pages are the **pre-existing** `void load()`-in-`useEffect` (CSA :358, Committee :471), not in this diff. `npm test` → **1489 pass / 0 fail** (a transient 4-failure blip mid-run was a concurrent rewrite of `move-of-payment.test.mts`, unrelated); committee + csa + applications suites in isolation → **177 / 177**. Browser walkthrough deferred to Phase 9.

---

## Phase 6 — LRA: advisory banner + read-only co-borrower panel (NO gate)

**Goal:** the release officer sees, on the file, (a) whether Committee asked for a co-borrower, (b) the co-borrower details if provided, and (c) a clear warning if it was asked for and is still missing — but **nothing is blocked**. Release proceeds exactly as it does today regardless.

**Design note — deliberately advisory (Rovick, 2026-09-01).** No change to `queueForLra`, `release-service.ts`, `blockers.ts`, the release checklist, or any status transition. `queueForLra` remains the chokepoint to `lra_pending`; we simply don't gate it. A co-borrower-required file with `co_borrowers = []` releases normally — the officer has just been shown the warning and chosen to proceed (or filled it in first via the Phase 4 route, which is still reachable up to `awaiting_confirmation`).

**Files to change:**
- **New pure helper** in a small file (e.g. `src/lib/applications/co-borrower.ts`): `coBorrowerBannerState({ coBorrowerRequired, coBorrowers, coBorrowerCompletedAt })` → `"not_required" | "provided" | "missing"`. Keep it a pure function so Phase 9 can test it directly.
- [`src/app/lra/applications/[id]/page.tsx`](../../src/app/lra/applications/[id]/page.tsx) — in the borrower-info area:
  - `"missing"` → a prominent warning callout (use the page's existing warning/alert component — do not invent one): *"The approving committee requested a co-borrower for this loan. No co-borrower details were provided. You may still proceed with release."*
  - `"provided"` → render `<CoBorrowerSection editable={false} coBorrowers={…} />` (read-only list).
  - `"not_required"` → render nothing.

**Out of scope:** every file listed in the Design note. The CSA/Committee pages (that's Phase 5). Any enforcement anywhere.

**Done when:** an LRA file that was flagged and left empty shows the warning and **still releases**; a flagged-and-filled file shows the read-only list; an unflagged file shows nothing new; `queueForLra` and the release path are byte-for-byte unchanged; full suite green.

### Status: DONE (2026-09-01)

- **[`src/lib/applications/co-borrower.ts`](../../src/lib/applications/co-borrower.ts)** — added `coBorrowerBannerState({ coBorrowerRequired, coBorrowers })` → `"not_required" | "provided" | "missing"`. Signature simplified from the sketch: it does **not** take `coBorrowerCompletedAt` — the state is fully determined by whether it was required and whether the list is non-empty. Pure, no deps.
- **[`src/app/lra/applications/[id]/page.tsx`](../../src/app/lra/applications/[id]/page.tsx)** — imports `CoBorrowerSection` + `coBorrowerBannerState` + `type CoBorrower`; `coBorrowerRequired` / `coBorrowers` added to the local `LraWorkspace.application` type. A small IIFE right after the "Loan summary" card renders: `"missing"` → `<Alert variant="warning" className="mb-6">` with the exact plan copy; `"provided"` → a `<Card>` wrapping `<CoBorrowerSection editable={false} />` (read-only list); `"not_required"` → `null`. Placed outside the `!rf` branch so it shows whether or not "Start processing" has been clicked.
- **Nothing else touched** — no `queueForLra`, `release-service.ts`, `blockers.ts`, release checklist, or status-transition change. There is **no release gate**; the warning is purely informational.
- **Verification:** `tsc` — 20 errors total, none in the LRA page or the helper (count is back to the pre-Phase-5 baseline; the concurrent `AccountLedger.tsx` churn cleared). `eslint` on the LRA page — the only errors are a **pre-existing** `setSelectedPaths(...)`-in-`useEffect` (:405/:410), not in this diff. `node --import tsx` smoke of `coBorrowerBannerState` — 3/3. `npm test` → **1489 pass / 0 fail**. Browser check deferred to Phase 9.

---

## Phase 7 — Documents: populate the reserved merge fields

**Goal:** generated documents that reference a co-borrower show the real data instead of a blank.

**Files to change:**
- [`src/lib/documents/generators/application-form-context.ts`](../../src/lib/documents/generators/application-form-context.ts) — `BuildApplicationFormContextInput` gains an optional `coBorrowers?: Array<{ fullName: string; address: string }>`. In `buildApplicationFormContext`, replace the hardcoded `coBorrowerName: ""` ([:153](../../src/lib/documents/generators/application-form-context.ts:153)) with:
  - `coBorrowerName: (input.coBorrowers ?? []).map((c) => c.fullName).join("; ")`
  - `coBorrowerAddress: (input.coBorrowers ?? []).map((c) => c.address).join("; ")`
  - `hasCoBorrower: (input.coBorrowers ?? []).length > 0` (drives the `data-if="hasCoBorrower"` template flag already in the catalog).
- The **one** call site that builds this context — locate it (grep `buildApplicationFormContext(`), read it, and pass `coBorrowers` from `loan_applications.co_borrowers`. If that call site's application query is a narrow select, add `co_borrowers` to it; change nothing else there.
- [`src/lib/documents/templates/fields.ts`](../../src/lib/documents/templates/fields.ts) — add a `coBorrowerAddress` entry next to `coBorrowerName` ([:39](../../src/lib/documents/templates/fields.ts:39)) so it shows in the template-editor palette. `hasCoBorrower` already exists ([:374](../../src/lib/documents/templates/fields.ts:374)).

**Out of scope:** the other three generators (acknowledgement-receipt, demand-letter, final-computation-sheet) — none reference a co-borrower. The superadmin PN template itself (content-managed, not code).

**Done when:** generating the application form for an application with co-borrowers fills `coBorrowerName`/`coBorrowerAddress` and sets `hasCoBorrower`; an application without co-borrowers renders exactly as it does today (blank name, `hasCoBorrower` false); full suite green.

### Status: DONE (2026-09-01)

- **[`src/lib/documents/generators/application-form-context.ts`](../../src/lib/documents/generators/application-form-context.ts)** — `BuildApplicationFormContextInput` gains optional `coBorrowers?: Array<{ fullName; address }>`. `coBorrowerName: ""` replaced with three keys: `coBorrowerName` (`; `-joined names), `coBorrowerAddress` (`; `-joined addresses), `hasCoBorrower` (true only if at least one row has **both** name and address — matches the `data-if="hasCoBorrower"` flag). Names/addresses run through the file's existing `str()` trimmer.
- **[`src/lib/documents/generators/application-form.ts`](../../src/lib/documents/generators/application-form.ts)** — the sole call site. Its narrow select gains `co_borrowers`; passes `coBorrowers: normalizeCoBorrowers(app.co_borrowers)` (reusing the Phase 4 pure helper). Nothing else changed.
- **[`src/lib/documents/templates/fields.ts`](../../src/lib/documents/templates/fields.ts)** — added `{ key: "coBorrowerAddress", label: "Co-borrower address", sample: "" }` next to `coBorrowerName` in the palette. `hasCoBorrower` flag already present — untouched.
- **Other generators / the superadmin PN template** — untouched, per plan.
- **Verification:** `tsc` — 20 baseline, none in these files. `eslint` — clean. `node --import tsx` smoke of `buildApplicationFormContext` — 3/3 (empty → blank + `hasCoBorrower:false`, two rows → `"A; B"` / `hasCoBorrower:true`, name-only row → `hasCoBorrower:false`). Existing `application-form-context` tests still pass (no whole-context `deepEqual`, only sub-slice assertions, so the added keys don't break them). `npm test` → **1489 pass / 0 fail**.

---

## Phase 8 — Tests

**Files to change (new or extend existing `__tests__`):**
- `src/lib/committee/__tests__/…` — `executeFinalAction` approve with `requireCoBorrower: true` sets `co_borrower_required = true` and leaves `blocker` null on a non-seafarer app; rejects on seafarer; plain approve unchanged (snapshot the existing assertions, add the new ones — do not weaken anything).
- New test for `coBorrowerBannerState` (Phase 6 helper) — `not_required` / `provided` / `missing` for each input combination.
- New `src/app/api/applications/[id]/co-borrowers/…` or a pure-function test for the route's validation branches (seafarer, not-required, wrong-status, row shape) — match how the codebase tests routes today (pure lib functions, per the Seafarer plan's Phase 4 note; extract the validation into a pure helper if the route can't be tested directly).
- `src/lib/documents/generators/__tests__/application-form-context…` — `coBorrowerName`/`coBorrowerAddress`/`hasCoBorrower` populate from `coBorrowers`; empty input reproduces today's output exactly.
- A regression assertion that `queueForLra` has **no** co-borrower branch (i.e. a co-borrower-required-and-empty application still reaches `lra_pending`) — locks in the advisory-only decision so a future change doesn't silently turn it into a gate.

**Done when:** `npm test` passes with the new cases; the count only goes up from the current baseline.

### Status: DONE (2026-09-01)

- **Refactor for testability:** the seafarer rejection inside `executeFinalAction`'s approve path was extracted to a pure `assertCoBorrowerRequirementAllowed(segment)` in `src/lib/applications/co-borrower.ts` (same precedent as the Seafarer plan's `validateSeafarerDueDay`), and `actions.ts` now calls it. Behaviour unchanged; the error string is identical.
- **New `src/lib/applications/__tests__/co-borrower.test.mts`** — pure helpers: `assertCoBorrowerRequirementAllowed` (seafarer reject / others allow), `assertCanEditCoBorrowers` (all 4 branches, incl. every `CO_BORROWER_EDITABLE_STATUSES` value and the locked statuses), `isCoBorrowerEditableStatus`, `normalizeCoBorrowers` (junk-dropping + non-array), `coBorrowerBannerState` (`not_required` / `missing` / `provided`).
- **New `src/lib/documents/generators/__tests__/application-form-context-co-borrower.test.mts`** — `buildApplicationFormContext`: absent → `""` / `""` / `hasCoBorrower:false` (byte-for-byte the old output); one row → populated; multiple → `; `-joined; name-only row → name shows but `hasCoBorrower` stays `false`.
- **New `src/lib/applications/__tests__/co-borrower-advisory.test.mts`** — source-scan regression locks (the DB-touching parts this codebase doesn't mock): the approve-time write is gated on `requireCoBorrower === true`; it is the **verbatim** `.update({ co_borrower_required: true, co_borrower_required_by: actorId })` (so adding `blocker` there fails the test); the pre-existing unconditional `blocker: null` clear is untouched; **`queueForLra`'s function body contains no `co_borrower` reference** — the advisory-only / no-release-gate decision is locked.
- The "flag set / row persisted / plain approve unchanged" DB behaviours have no mock seam here (confirmed: every committee test targets pure functions only) — those are the Phase 9 walkthrough.
- **Verification:** `tsc` — 20 baseline, none in touched files. `eslint` — clean. `npm test` → **1509 pass / 0 fail** (+20 from the 1489 baseline, exactly the new cases).

---

## Phase 9 — Manual verification (no code)

In a real browser session:
1. Committee approves a **non-seafarer** application with "Require a co-borrower" ticked → app is `approved`; no `blocker` is set; the CSA/Committee co-borrower section shows with the "Requested by Committee — not yet provided" caption.
2. Confirm the **seafarer** decision panel has no such checkbox, and a direct API call with `requireCoBorrower: true` on a seafarer app is rejected.
3. As CSA, open that approved application → the Co-Borrower section is editable; add two co-borrowers (name + address each); save → rows persist on reload; caption switches to the read-only list.
4. Take the file through disclosure + sign → it reaches `lra_pending` normally. Then repeat the whole flow on a **second** flagged application, this time **without** filling the section → it **still** reaches `lra_pending` (advisory only), and the LRA page shows the amber "committee requested a co-borrower / none provided / you may still proceed" warning.
5. Generate the application form PDF for the filled one → co-borrower name(s) and address(es) appear; `data-if="hasCoBorrower"` blocks render. Generate it for an unflagged application → identical to today (blank).
6. As LRA, open the filled file → co-borrowers shown read-only, no edit control.
7. Regression: run a normal application with no co-borrower requirement end-to-end → identical to today at every step.

### Status: DONE (2026-09-01) — live-verified on the running dev server

Method: browsed the user's dev server on :3000, quick-login as CSA (seed button, no credentials), plus service-role SQL to flip `co_borrower_required` on real demo apps (**AN300427** sme/individual `submitted`; **AN300006** seafarer `submitted`) and revert afterwards. All demo data restored — 0 rows with `co_borrower_required = true` system-wide at the end; both test apps back to `false` / `[]` / `null`.

**Verified live:**
| Check | Result |
|---|---|
| CSA page, not required | No co-borrower card, no console error |
| CSA page, required + non-seafarer | Card renders between "Application Form" and "Data Privacy Act orientation" with the "requested — not yet provided" caption + empty editable state |
| Add a co-borrower via the UI → Save | `PATCH /api/applications/:id/co-borrowers` → **200**; DB `co_borrowers = [{fullName, address}]`; `co_borrower_completed_at` stamped once |
| Audit trail | `audit_events` row: `intake` / `update` / `loan_application`, `before_data {coBorrowers:[]}` → `after_data {coBorrowers:[{…}]}` |
| Hard reload | Row hydrates from the server; caption switches to the "provided" variant |
| Route rejections (as the CSA user) | bad shape → 400 zod; blank name → 400 "name is required"; 11 rows → 400 "At most 10"; not-required app → 400 "does not require a co-borrower"; **seafarer app → 400 "do not apply to seafarer"** |
| Permission | CSA (`intake.edit`) is authorized for the route |
| Document generation | `POST …/application-form` → 200; downloaded the rendered `application_form_sme_individual` PDF → contains **"Maria Santos Reyes"** under "CO-BORROWER'S SIGNATURE OVER PRINTED NAME" (full Phase 7 chain proven: `co_borrowers` → context → `{{coBorrowerName}}` → PDF) |
| Guard #3 (seafarer exclusion) | Seafarer app with `co_borrower_required = true` → **no** co-borrower card on the CSA page |

**Not exercisable on current demo data — covered by Phase 8 tests + code:**
- Committee approve with the checkbox ticked (steps 1–2 first half): no non-seafarer application sits at `for_approval`, and reaching vote quorum needs 3 distinct committee voters. Covered by the `assertCoBorrowerRequirementAllowed` unit test + the Phase 8 source-scan (approve write gated on `requireCoBorrower`, never touches `blocker`). The checkbox render is a one-line `segment !== "seafarer"` conditional.
- Disclosure → sign → `lra_pending`, and "still releases when the list is empty" (step 4): needs the full approve→disclose→sign chain on a non-seafarer app. Covered by the Phase 8 source-scan proving `queueForLra`'s body has zero `co_borrower` references — the advisory-only / no-gate guarantee.
- LRA read-only banner render (step 6): no non-seafarer app at a release stage in demo data. Covered by the `coBorrowerBannerState` unit tests (3 states); the LRA page block is a straightforward conditional.

---

## Feature status: COMPLETE (2026-09-01)

All 10 phases (0–9) done. Migration `20260901050000_co_borrower_section_schema.sql` applied live. Test suite **1509 / 1509**. Live-verified end-to-end on the running app for every path the demo data allows (see Phase 9); the committee-approval and LRA-render paths are locked by Phase 8 tests. Feature #3 in [implementation-tracker-2026-08-25.md](../implementation-tracker-2026-08-25.md) can be marked done.

### Files touched (all phases)

- **Migration:** `loanstar/supabase/migrations/20260901050000_co_borrower_section_schema.sql` (+ live apply)
- **New:** `src/lib/applications/co-borrower.ts`, `src/lib/applications/__tests__/co-borrower.test.mts`, `src/lib/applications/__tests__/co-borrower-advisory.test.mts`, `src/app/api/applications/[id]/co-borrowers/route.ts`, `src/components/applications/CoBorrowerSection.tsx`, `src/lib/documents/generators/__tests__/application-form-context-co-borrower.test.mts`
- **Edited:** `src/lib/csa/application.ts`, `src/lib/committee/actions.ts`, `src/app/api/committee/applications/[id]/action/route.ts`, `src/app/api/csa/applications/[id]/route.ts`, `src/app/api/committee/applications/[id]/route.ts`, `src/app/api/lra/applications/[id]/route.ts`, `src/app/committee/applications/[id]/page.tsx`, `src/app/csa/applications/[id]/page.tsx`, `src/app/lra/applications/[id]/page.tsx`, `src/lib/documents/generators/application-form-context.ts`, `src/lib/documents/generators/application-form.ts`, `src/lib/documents/templates/fields.ts`

---

## How to use this file

Implement one phase at a time, in order (0→9). Phases 1, 2, 4, 6, 7 each depend on Phase 0's columns; Phase 3 needs Phase 2; Phase 5 and Phase 6 need Phase 4's component. After each phase produce a short summary for validation against this document before starting the next. After Phase 9, produce one combined end-to-end summary — every file, every migration, the final test count — for a single validation pass before Feature #3 is marked done in [implementation-tracker-2026-08-25.md](../implementation-tracker-2026-08-25.md).
