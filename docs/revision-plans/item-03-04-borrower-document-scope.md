# Items 3+4 — Borrower Document Scope (combined, step-by-step)

Part of the System Revision Report rollout. See `loanstar/docs/system-revision-report-tracker.md` for the workflow rules and overall status.

**Tracker items covered:**
- Item 3: *Borrowers only responsible for uploading: house sketch, valid ID, passport, seaman's book, 2x2 photo, and loan contract.*
- Item 4: *Other required docs (e.g. Data Privacy Consent) signed in person at branch; CSA uploads signed copies afterward — not a borrower step.*

**Why these two are combined into one plan:** they're two sides of the same fix. Item 4 moves 4 document types (Declaration Form, Agency Consent Letter, Data Privacy Consent, BAP Customer Consent) out of the borrower-facing checklist into a "CSA uploads it after in-branch signing" bucket. Once that happens, the borrower's checklist naturally shrinks to exactly the 6 items Item 3 names — nothing borrower-specific needs to be built separately. The only extra gap: Passport and Contract are currently flagged *optional* in the database, so they don't yet count as part of the borrower's real responsibility.

**How to use this file:** implement the phases below **in order, one at a time**. After each phase, stop, report a summary of what changed, and wait for validation before starting the next phase. Do not jump ahead or combine phases even though they're all in one file — the ordering and isolation matter (Phase 3 is expected to leave one test red on purpose; Phase 5 is what fixes it). **After all 5 phases are implemented, produce one final combined summary report covering every phase** (all files changed across all phases, all migrations applied, full test suite result, everything deliberately left alone) — this is in addition to, not instead of, each phase's own summary. The user sends this combined report back for a final end-to-end validation pass before the item is marked Done.

**Ground rules (apply to every phase below):**
- Touch only the files listed for that phase's "Change to make" / "Files to change." If you notice something related but unlisted, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- Do not change DB columns/tables beyond what a phase's migration specifies. Additive/corrective only.
- Run existing tests after each phase; don't delete or weaken a test to make it pass (Phase 3's one expected red test is the sole exception, and only until Phase 5).
- At the end of each phase, output a summary: files changed, migration(s) applied, tests run/result, and anything deliberately left alone that looked related.

---

## Phase 1 — Migration: make Passport required (seafarer)

### Audit findings (evidence, verified 2026-08-10, live DB `acopcwlhkovssjnrqygk`)

`stage_checklists` row for `document_types.slug = 'passport'`, `stage = 'intake'`, `segment = 'seafarer'`:
- `stage_checklists.id = '93644f27-60cd-4746-b489-4df10536c5a9'`
- Currently: `is_required = false`, `is_optional_flag = true`

`is_required` and `is_optional_flag` are two independent columns (confirmed via `src/app/api/admin/stage-checklists/route.ts:13-14`, which lets the admin UI set them independently), but every existing row in this table today has them as exact inverses (`is_optional_flag = NOT is_required`) — consistent with the admin checklist screen's own convention (`src/app/admin/checklists/page.tsx:147`). Flip both together to stay consistent.

`getCompletionSummary` (`src/lib/documents/checklist.ts:284-308`, shared/do-not-edit) only counts `isRequired` items toward the "X of Y" completeness numbers shown across borrower/CSA/CIG/committee/AR/LRA. Flipping `is_required` on this row is what makes Passport count as required everywhere those numbers already display — no other code changes needed for this phase.

### Change to make

```sql
UPDATE stage_checklists
SET is_required = true, is_optional_flag = false
WHERE id = '93644f27-60cd-4746-b489-4df10536c5a9';
```

Re-verify this row id still matches `segment = 'seafarer' AND document_type_id = (SELECT id FROM document_types WHERE slug = 'passport')` before running — it was read live moments before writing this plan, but confirm rather than assume.

Apply as a new migration file (`YYYYMMDDHHMMSS_seafarer_intake_passport_required.sql`) via Supabase MCP, written to **both** `supabase/migrations/` and `loanstar/supabase/migrations/` per this project's established two-folder convention — not `supabase db push`.

### Explicitly out of scope for this phase

- `contract` (Phase 2, below — do not combine into this same migration).
- Any SME-segment row.
- `declaration_form`, `agency_consent_letter`, `data_privacy_consent`, `bap_customer_consent`, `clearance_form` — untouched (Phase 3 handles the CSA-only reclassification, a code change not a DB change).
- `src/lib/documents/checklist.ts` — shared helper, not touched.

### Validation checklist

- [ ] Exactly 1 row changed in `stage_checklists` — the passport/seafarer row.
- [ ] Both `is_required = true` and `is_optional_flag = false` on that row.
- [ ] No other row (any slug, any segment) touched.
- [ ] Migration file present in both `supabase/migrations/` and `loanstar/supabase/migrations/`.
- [ ] `getCompletionSummary`/`getStageChecklist` source unchanged.

### Status: Ready for Cursor (not yet implemented)

---

## Phase 2 — Migration: make Contract (loan contract) required (seafarer)

Send only after Phase 1 has been implemented and validated.

### Audit findings

`stage_checklists` row for `document_types.slug = 'contract'` (this is the "loan contract" named in the revision report — confirm the `document_types.name` for this row reads "Contract" before running, since that's the only doc type matching "loan contract" in the seafarer intake list), `stage = 'intake'`, `segment = 'seafarer'`:
- `stage_checklists.id = 'de5dbdb4-0203-425a-ac9d-d7ed00a785c3'`
- Currently: `is_required = false`, `is_optional_flag = true`

Same column-pairing rationale as Phase 1 — flip both together.

### Change to make

```sql
UPDATE stage_checklists
SET is_required = true, is_optional_flag = false
WHERE id = 'de5dbdb4-0203-425a-ac9d-d7ed00a785c3';
```

Re-verify this row id still matches `segment = 'seafarer' AND document_type_id = (SELECT id FROM document_types WHERE slug = 'contract')` before running — especially since Phase 1's migration will have already landed by the time this runs.

Apply as a new migration file (`YYYYMMDDHHMMSS_seafarer_intake_contract_required.sql`) via Supabase MCP, written to both migration folders — not `supabase db push`.

### Explicitly out of scope for this phase

- `passport` — that was Phase 1, already landed; do not re-touch it (verify it's still `is_required = true` as a sanity check, but don't modify it here).
- Any SME-segment row.
- `declaration_form`, `agency_consent_letter`, `data_privacy_consent`, `bap_customer_consent`, `clearance_form` — untouched (Phase 3 handles CSA-only reclassification separately).
- `src/lib/documents/checklist.ts` — shared helper, not touched.

### Validation checklist

- [ ] Exactly 1 row changed in `stage_checklists` — the contract/seafarer row.
- [ ] Both `is_required = true` and `is_optional_flag = false` on that row.
- [ ] Passport row from Phase 1 confirmed still `is_required = true` (unmodified by this phase, just verified intact).
- [ ] No SME-segment row touched.
- [ ] Migration file present in both migration folders.

### Status: Ready for Cursor (not yet implemented) — send after Phase 1 lands and is validated

---

## Phase 3 — Backend: extend the CSA-only slug array

Send after Phases 1-2 have landed. Independent mechanism (code, not DB), but keep the rollout sequential.

### Audit findings

- There is already a working, tested mechanism for exactly this kind of change: `CSA_ONLY_INTAKE_SLUGS` in `src/lib/documents/csa-only-intake.ts:2` — currently `["clearance_form"] as const`. Slugs in this array are:
  1. Filtered out of the borrower checklist API response — `excludeCsaOnlyIntakeItems()`, called in `src/app/api/borrower/applications/[id]/checklist/route.ts:81-83`.
  2. Filtered out of the agent portal's checklist flags the same way — `src/app/api/agent/leads/[id]/route.ts:61`.
  3. Hard-blocked from direct borrower upload — `isCsaOnlyIntakeSlug()` check in `src/app/api/borrower/applications/[id]/documents/route.ts:72-80` (error-message wording is handled in Phase 4 — don't touch it here).
- CSA already has a fully generic, unrestricted intake-document upload route not filtered by this array — `src/app/api/csa/applications/[id]/documents/route.ts` (permission `intake:edit`). It accepts any `documentTypeId` for `stage: "intake"`. **No changes needed there** — CSA can already upload all 4 of these document types today; the only reason borrowers currently see them is that they aren't yet in this array.
- CSA's own checklist view (`src/app/api/csa/applications/[id]/checklist/route.ts`) does not call `excludeCsaOnlyIntakeItems` — CSA already sees the full, unfiltered list. No change needed there.
- No borrower or agent frontend page hardcodes any of these document names (`grep` for "Declaration Form" / "Agency Consent" / "Data Privacy Consent" / "BAP Customer" across `src/app/borrower` and `src/app/agent` returns zero matches) — checklist rendering is fully data-driven from the API. **No `.tsx` changes needed in this phase.**
- `src/lib/documents/__tests__/csa-only-intake.test.mts:14` currently asserts `isCsaOnlyIntakeSlug("declaration_form") === false`. This assertion **will start failing** once this phase lands — expected and correct; Phase 5 fixes it. Do not touch this test file in this phase.

### Change to make

**`src/lib/documents/csa-only-intake.ts`**, line 2:

```diff
- export const CSA_ONLY_INTAKE_SLUGS = ["clearance_form"] as const;
+ export const CSA_ONLY_INTAKE_SLUGS = [
+   "clearance_form",
+   "declaration_form",
+   "agency_consent_letter",
+   "data_privacy_consent",
+   "bap_customer_consent",
+ ] as const;
```

Do not touch `isCsaOnlyIntakeSlug` or `excludeCsaOnlyIntakeItems` function bodies — they already work generically over the array.

### Explicitly out of scope for this phase

- `src/app/api/borrower/applications/[id]/documents/route.ts` — the 403 error message there still says "Clearance Form" specifically; that's Phase 4.
- `src/lib/documents/__tests__/csa-only-intake.test.mts` — Phase 5 fixes the now-outdated assertion; don't touch it here even though you'll see it fail.
- Any borrower/agent `.tsx` page.
- `src/app/api/csa/applications/[id]/documents/route.ts` and `.../checklist/route.ts` — already correct, no change.
- `src/lib/documents/checklist.ts` — shared helper, untouched.
- `stage_checklists` DB rows for these 4 slugs — their `is_required`/`is_optional_flag` stay exactly as-is (still required — just required-of-CSA now, not required-of-borrower). This phase changes *who* uploads them, not the DB row.
- `src/app/api/csa/applications/[id]/privacy-orientation/route.ts` — a distinct, already-existing feature (CSA recording a verbal Data Privacy Act briefing) unrelated to this document-upload change; do not touch or conflate with it.

### Validation checklist

- [ ] `CSA_ONLY_INTAKE_SLUGS` contains exactly 5 entries: `clearance_form`, `declaration_form`, `agency_consent_letter`, `data_privacy_consent`, `bap_customer_consent` — nothing more, nothing less.
- [ ] `isCsaOnlyIntakeSlug`/`excludeCsaOnlyIntakeItems` function bodies unchanged.
- [ ] Only `csa-only-intake.ts` was changed — no other file touched.
- [ ] Borrower checklist API response for a fresh seafarer application now excludes all 5 CSA-only slugs — verify with a live API check, not just the diff.
- [ ] CSA's own checklist/upload routes untouched and still see/accept all items.
- [ ] Cursor's test run shows the `csa-only-intake.test.mts` line-14 assertion now failing — this is expected; confirm it's the *only* new failure, not a sign of a broader break.

### Status: Ready for Cursor (not yet implemented) — send after Phases 1-2 land

---

## Phase 4 — Backend: generalize the borrower-upload block message

Send after Phase 3 has landed and been validated — this phase's message now applies to 5 slugs, not just 1.

### Audit findings

`src/app/api/borrower/applications/[id]/documents/route.ts:72-80`:

```ts
if (docType && isCsaOnlyIntakeSlug(docType.slug as string)) {
  return NextResponse.json(
    {
      error:
        "Clearance Form is managed by CSA and cannot be uploaded from the borrower portal.",
    },
    { status: 403 },
  );
}
```

This message hardcodes "Clearance Form" even though, after Phase 3, this same block now fires for 5 different document types. A borrower trying to upload, say, a Data Privacy Consent scan would incorrectly be told "Clearance Form is managed by CSA" — confusing and wrong.

### Change to make

**`src/app/api/borrower/applications/[id]/documents/route.ts`**, lines 74-79 — change only the message string:

```diff
    return NextResponse.json(
      {
        error:
-         "Clearance Form is managed by CSA and cannot be uploaded from the borrower portal.",
+         "This document is managed by CSA and cannot be uploaded from the borrower portal — it's signed in person at the branch.",
      },
      { status: 403 },
    );
```

Do not change the `if` condition, the `docType`/`isCsaOnlyIntakeSlug` check, the 403 status code, or anything else in the file.

### Explicitly out of scope for this phase

- `src/lib/documents/csa-only-intake.ts` — already correct from Phase 3, don't re-touch.
- `src/lib/documents/__tests__/csa-only-intake.test.mts` — Phase 5, separate step.
- Any other string/message elsewhere in the borrower portal.
- Any `.tsx` page — this route returns JSON; the borrower page's generic error-alert rendering should already display whatever the API returns without any hardcoded assumption about the text. Verify but don't edit unless it genuinely doesn't fit.

### Validation checklist

- [ ] Only the error string in `documents/route.ts` changed — a single-line text swap.
- [ ] No occurrence of the literal old string "Clearance Form is managed by CSA" remains anywhere in `src/`.
- [ ] The `if` condition and 403 status are byte-identical to before.
- [ ] A borrower POST attempting to upload any of the 5 CSA-only slugs now returns the new generic message.
- [ ] No other file touched.

### Status: Ready for Cursor (not yet implemented) — send after Phase 3 lands

---

## Phase 5 — Tests: fix and extend csa-only-intake coverage

Send after Phase 3 has landed — this phase specifically fixes the test breakage that Phase 3 intentionally leaves behind, and adds coverage for the new slugs. Can run before or after Phase 4 (independent file).

### Audit findings

`src/lib/documents/__tests__/csa-only-intake.test.mts` (full file, 27 lines, before this phase):

```ts
describe("csa-only intake slugs", () => {
  it("marks clearance_form as CSA-only", () => {
    assert.ok(CSA_ONLY_INTAKE_SLUGS.includes("clearance_form"));
    assert.equal(isCsaOnlyIntakeSlug("clearance_form"), true);
    assert.equal(isCsaOnlyIntakeSlug("declaration_form"), false);   // <- now WRONG after Phase 3
  });

  it("filters clearance_form out of checklist-like arrays", () => {
    const items = [
      { documentTypeSlug: "clearance_form", name: "Clearance" },
      { documentTypeSlug: "declaration_form", name: "Declaration" },  // <- now also CSA-only, no longer a good "control" example
    ];
    assert.deepEqual(excludeCsaOnlyIntakeItems(items), [
      { documentTypeSlug: "declaration_form", name: "Declaration" },  // <- this expected-output line is now WRONG too
    ]);
  });
});
```

After Phase 3, `CSA_ONLY_INTAKE_SLUGS` is `["clearance_form", "declaration_form", "agency_consent_letter", "data_privacy_consent", "bap_customer_consent"]`. The line asserting `declaration_form` is *not* CSA-only, and the "filter" test's expectation that `declaration_form` survives filtering, are both now incorrect.

### Change to make

**`src/lib/documents/__tests__/csa-only-intake.test.mts`** — rewrite the two outdated assertions and add coverage for all 4 new slugs. Suggested full replacement:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CSA_ONLY_INTAKE_SLUGS,
  excludeCsaOnlyIntakeItems,
  isCsaOnlyIntakeSlug,
} from "../csa-only-intake";

describe("csa-only intake slugs", () => {
  it("marks all 5 CSA-only slugs correctly", () => {
    const expected = [
      "clearance_form",
      "declaration_form",
      "agency_consent_letter",
      "data_privacy_consent",
      "bap_customer_consent",
    ];
    for (const slug of expected) {
      assert.ok(CSA_ONLY_INTAKE_SLUGS.includes(slug as (typeof CSA_ONLY_INTAKE_SLUGS)[number]));
      assert.equal(isCsaOnlyIntakeSlug(slug), true);
    }
  });

  it("does not mark genuinely borrower-facing slugs as CSA-only", () => {
    for (const slug of ["house_sketch", "valid_ids", "passport", "seaman_book", "photo_2x2", "contract"]) {
      assert.equal(isCsaOnlyIntakeSlug(slug), false);
    }
  });

  it("filters all CSA-only items out of checklist-like arrays, keeps borrower-facing ones", () => {
    const items = [
      { documentTypeSlug: "clearance_form", name: "Clearance" },
      { documentTypeSlug: "declaration_form", name: "Declaration" },
      { documentTypeSlug: "agency_consent_letter", name: "Agency Consent Letter" },
      { documentTypeSlug: "data_privacy_consent", name: "Data Privacy Consent" },
      { documentTypeSlug: "bap_customer_consent", name: "BAP Customer Consent" },
      { documentTypeSlug: "house_sketch", name: "House Sketch" },
    ];
    assert.deepEqual(excludeCsaOnlyIntakeItems(items), [
      { documentTypeSlug: "house_sketch", name: "House Sketch" },
    ]);
  });
});
```

Cursor may adjust exact wording/structure as long as: (a) no assertion claims a now-CSA-only slug is borrower-facing, (b) all 4 new slugs plus the existing `clearance_form` are covered, (c) at least one genuinely-borrower-facing slug (from Item 3's 6-item list) is asserted to remain un-filtered as a control.

### Explicitly out of scope for this phase

- `src/lib/documents/csa-only-intake.ts` — already correct from Phase 3, do not touch production code.
- `src/app/api/borrower/applications/[id]/documents/route.ts` — Phase 4, separate step.
- Any other test file — this phase touches exactly one file.

### Validation checklist

- [ ] Only `csa-only-intake.test.mts` changed.
- [ ] No production code (`csa-only-intake.ts` or any route) touched in this phase.
- [ ] Full test suite passes with zero failures (this closes out the intentional red left by Phase 3).
- [ ] Test coverage includes all 5 CSA-only slugs asserted `true`, and at least the 6 Item-3 borrower-facing slugs asserted `false`/unfiltered.

### Status: Ready for Cursor (not yet implemented) — send after Phase 3 lands

---

## Overall item status: DONE (validated 2026-08-10)

All 5 phases implemented by Cursor and validated by Claude directly against live code and DB:
- Phase 1/2: `stage_checklists` rows for passport and contract (seafarer) confirmed `is_required=true, is_optional_flag=false`; migrations present in both folders with tightly-scoped `WHERE` clauses.
- Phase 3: `CSA_ONLY_INTAKE_SLUGS` confirmed to contain exactly the 5 expected slugs.
- Phase 4: error message confirmed swapped, condition/status untouched.
- Phase 5: test file confirmed rewritten correctly; full suite run by Cursor reported 545/545 passing, 0 failures, exit 0.

Net effect confirmed: seafarer borrower intake responsibility is now exactly the 6 named documents; the 4 branch-signed documents are CSA-only (hidden/blocked for borrower & agent, CSA still uploads them via its existing unrestricted route).
