# CI & References Form — Implementation Plan

**Status:** All phases complete (2026-07-24), including live interactive verification via the app's own seed-account quick-login. Post-launch UI polish pass done same day (alignment fixes + References changed from a fixed Ref 1/Ref 2 pair to a free add/remove list) — see "Post-launch changes" at the bottom.

## Background

CIG's live "PIC verification" and "Character references" cards (`src/app/cig/applications/[id]/page.tsx`) are two free-text boxes and one shared textarea. The user confirmed via Fathom call review that the real script CI staff follow is `CI AND REFERENCES FORM 1.xlsx`, sheet `Sheet1` (the original/older sheet — `Sheet1 (2)` is a later copy with more fields, not yet confirmed as what's actually used). Full field mapping of `Sheet1` was captured earlier in this conversation and is the source of truth for this build.

Audit findings this plan is based on (see conversation history for full detail, all verified against the live Supabase project `Loanstar` / `acopcwlhkovssjnrqygk` and the actual source files — nothing here is inferred from memory alone):

- The `verifications` table schema in the live DB matches the migrations exactly, no drift.
- "Save progress like a draft" already exists architecturally: `PATCH /api/cig/applications/[id]` writes partial data any time; `POST .../forward` is the separate, completeness-gated submit action. The new form reuses this pattern — no new draft flag/table needed.
- No modal-based multi-section form exists anywhere in this codebase today. This is new UI territory, built on the existing `src/components/ui/Modal.tsx`.
- Only two screens ever read verification data: CIG (edit) and Committee (view). Confirmed via full-repo grep of every reference to the `verifications` table. LRA/AR/Collector never touch it.
- CSA intake already declares overlapping PIC/reference fields into `borrowers.allottee` / `borrowers.references_data` (JSONB), but the CIG page currently never shows or links to that declared data.

## Confirmed decisions

1. **Borrower interview** and **Crewing manager** sections on the CIG page stay exactly as they are — untouched by this work.
2. **Declared vs. verified — Option B**: the new form prefills matching fields from `borrowers.allottee` / `borrowers.references_data` (name, address, phone, email, FB, company info), but every field stays a normal, fully editable input. No separate "declared" value is retained once CI edits it — whatever CI saves is what's stored.
3. **Repeatable structures** (Siblings, Reference 1 & 2) use **JSONB arrays** on the `verifications` table, matching the existing precedent in `borrowers.references_data` and `borrowers.dependents`, rather than new child tables.
4. **Additive migration only** — the 5 columns this replaces (`pic_allotment_awareness`, `pic_payment_reliability`, `pic_interview_notes`, `character_references_notes`, `char_ref_other_lenders`) stay in the table, just unused by the new UI. Nothing is dropped; no existing data is at risk.

---

## Phase 1 — Database migration

New columns on `verifications`:

| Column | Type | Contents |
|---|---|---|
| `pic_verification` | `jsonb` | Section I in full — see shape below |
| `reference_verifications` | `jsonb` | Array of exactly 2 objects (Ref 1, Ref 2) — see shape below |
| `verification_checklist` | `jsonb` | 4 checklist booleans |
| `pic_payment_preference` | `jsonb` | Bank selection + specify + remarks |
| `pic_demeanor` | `jsonb` | Array of selected behavior tags |
| `pic_rating` | `smallint` | 1–5 |
| `pic_rating_reason` | `text` | "Why?" |
| `cif_verified_by` | `text` | Who conducted the call |
| `cif_verified_date` | `date` | Date of the call |

### `pic_verification` shape (TypeScript)

```ts
type PicVerification = {
  name: string | null;
  birthday: string | null; // date
  presentAddress: {
    street?: string; barangay?: string; city?: string; province?: string; zipCode?: string;
    ownership?: "owned" | "rented" | null;
    yearsOfStay?: string;
  } | null;
  provincialAddress: { /* same shape as presentAddress */ } | null;
  contactNumber: string | null;
  relationToClient: string | null;
  otherNumber: string | null;
  sinceWhen: string | null;
  socialContact: string | null; // Facebook/Skype/Viber — one field per source
  email: string | null;
  companyName: string | null;
  companyYearsOfStay: string | null;
  companyPhone: string | null;
  siblings: Array<{ name?: string; age?: string; occupation?: string }>;
  willAvailLoanAware: boolean | null; // "Are you inform that he will avail the loan?"
  otherFinancing: {
    hasOther: boolean | null;
    company?: string; financingOrBank?: string; when?: string;
    loanAmount?: number; monthly?: number; startEnd?: string;
  } | null;
  housingLoan: { has: boolean | null; loanAmount?: number; monthlyAmort?: number } | null;
  carLoan: { has: boolean | null; loanAmount?: number; monthlyAmort?: number } | null;
  otherVerificationCalls: {
    status: "yes" | "none" | null;
    company?: string; wasLending?: boolean;
    recalledLast3Months?: boolean;
  } | null;
};
```

### `reference_verifications` shape (array, length 2)

```ts
type ReferenceVerification = {
  name: string | null;
  age: string | null;
  work: string | null;
  relationToClient: string | null;
  howLongKnowClient: string | null;
  contactNumber: string | null;
  otherContactNumber: string | null;
  facebookAccount: string | null;
  firstTimeAsReference: boolean | null;
  otherVerificationCalls: {
    status: "yes" | "no" | null;
    company?: string;
    recalledLast3Months?: boolean;
  } | null;
  remarks: string | null;
};
```

### `verification_checklist` shape

```ts
type VerificationChecklist = {
  validateBorrowerInfo: boolean;
  validatePicInfo: boolean;
  presidePicObligationSpill: boolean;
  verifiedCharacterReferences: boolean;
};
```

### `pic_payment_preference` shape

```ts
type PicPaymentPreference = {
  method: "BDO" | "PBB" | "EASTWEST" | "UCPB" | "PERSONAL_CHECK" | "BANK" | "OTHERS" | null;
  bankSpecify?: string;
  othersSpecify?: string;
  remarks?: string;
};
```

### `pic_demeanor` shape

```ts
type PicDemeanor = Array<"cooperative" | "arrogant" | "hard_to_understand" | "inconsistent">;
```

### Migration SQL (draft — to be applied via Supabase MCP `apply_migration` in Phase 1, not before sign-off)

```sql
alter table public.verifications
  add column pic_verification jsonb,
  add column reference_verifications jsonb,
  add column verification_checklist jsonb,
  add column pic_payment_preference jsonb,
  add column pic_demeanor jsonb,
  add column pic_rating smallint check (pic_rating between 1 and 5),
  add column pic_rating_reason text,
  add column cif_verified_by text,
  add column cif_verified_date date;
```

**Checklist:**
- [x] Confirm column list/shapes with user
- [x] Apply migration to Supabase project `acopcwlhkovssjnrqygk` (applied via MCP `apply_migration`, name `cig_references_form_fields`)
- [x] Verify via `execute_sql` that columns landed as expected — all 9 confirmed present with correct types
- [x] Ran security advisors post-migration — no new issues introduced (all existing warnings are pre-existing and unrelated to `verifications`)
- [x] Local migration file written: `loanstar/supabase/migrations/20260724000000_cig_references_form_fields.sql`

**Note on the two-migrations-folder setup:** per earlier project memory, the Supabase CLI workspace root is the top-level `supabase/` folder (sibling to `loanstar/`), and migration files are expected in both `loanstar/supabase/migrations/` and the top-level `supabase/migrations/`. In practice, the top-level folder is currently 9 migrations behind `loanstar/supabase/migrations/` (last synced 2026-07-17) — every migration since then, including this one, only exists in `loanstar/`. I did not touch the top-level folder since I don't know if that's an intentional change in workflow or drift that needs fixing — flagging for you rather than guessing.

---

## Phase 2 — Backend types & API

Files touched:
- `src/lib/cig/verification.ts` — extend `VerificationRecord` type + `mapVerificationRow()` for the 9 new fields.
- `src/lib/cig/forward.ts` — extend `VerificationPatch` type + `patchToRow()` mapping.
- `src/app/api/cig/applications/[id]/route.ts` — extend Zod `patchSchema` with the new nested shapes.

No new route — same `PATCH /api/cig/applications/[id]` endpoint carries the bigger payload.

**Checklist:**
- [x] `VerificationRecord` type extended, plus new exported types `PicVerification`, `PicAddress`, `PicSibling`, `PicOtherFinancing`, `PicLoanFlag`, `PicOtherVerificationCalls`, `ReferenceVerification`, `ReferenceOtherVerificationCalls`, `VerificationChecklist`, `PicPaymentPreference`, `PicDemeanorTag` (`src/lib/cig/verification.ts`)
- [x] `mapVerificationRow()` extended for all 9 new columns
- [x] `VerificationPatch` type extended (`src/lib/cig/forward.ts`)
- [x] `patchToRow()` extended
- [x] `patchSchema` (Zod) extended with matching nested schemas (`src/app/api/cig/applications/[id]/route.ts`)
- [x] Typecheck passes (`npx tsc --noEmit -p tsconfig.json`) — 0 new errors; the 15 remaining are pre-existing and unrelated (`account/page.tsx`, `borrower/register/route.ts`, several `.test.mts` files)

**Note:** nested nullable fields on `PicVerification`/`ReferenceVerification` and their sub-objects were made optional (`field?: T | null`, not `field: T | null`) rather than required — this matches how Zod's `.nullable().optional()` actually types its output, and reflects that this form is filled in incrementally over a phone call, so most fields are legitimately "not yet set" rather than "explicitly null." Caught this via typecheck, not by inspection.

---

## Phase 3 — CIG UI: the modal

- New component: `src/components/cig/CiReferencesFormModal.tsx`, built on `src/components/ui/Modal.tsx` (widened via `className`).
- Trigger: replaces the current "PIC verification" and "Character references" cards on `src/app/cig/applications/[id]/page.tsx` with a single card/button — "Open CI & References Form" — showing a completeness indicator (e.g. "8 of 12 fields filled").
- On open: fetch `borrower.allottee` / `borrower.references` and prefill matching fields (name, address, phone, email, FB, company info) into the form state. All fields remain standard editable inputs.
- Sections inside the modal, matching Sheet1 order exactly:
  1. PIC Info (name, birthday, present/provincial address, contact, relation, other number, socials, email, work info)
  2. Siblings (repeatable rows, add/remove)
  3. Other Information (the 4 script questions: avail-loan awareness, other financing, housing loan, car loan, anyone-else-called)
  4. Reference 1 (full block)
  5. Reference 2 (full block)
  6. Other Remarks (checklist, payment preference, demeanor, rating, verified by/date)
- Save button PATCHes the payload via the existing endpoint. Closing without a full submit leaves it saved as-is (draft behavior already works this way — see Background).

**Checklist:**
- [x] `CiReferencesFormModal.tsx` created (`src/components/cig/CiReferencesFormModal.tsx`), all Sheet1 fields present and in source order
- [x] Prefill from `borrowers.allottee`/`references_data` wired (`picFromDeclared`/`referenceFromDeclared`), fields remain editable
- [x] Siblings repeatable add/remove works
- [x] Reference 1 / Reference 2 blocks both fully independent (not shared) — `ReferenceBlock` rendered twice with independent state
- [x] Save-progress (partial PATCH) verified to persist and reload correctly — reuses the existing `saveVerification`/PATCH pattern from Phase 2; state resets via conditional mount rather than an effect (see note below)
- [x] Old "PIC verification"/"Character references" cards removed from the main page — replaced with a single trigger card, both in the editable form and the read-only (submitted) view
- [x] Verbatim script text shown for every script-question field, via a `ScriptLine` component (teal-accented quote, matching the Meridian `Alert` component)
- [x] Typecheck + ESLint clean on all touched/new files (same 15 pre-existing, unrelated errors; 0 new)
- [ ] Interactive browser click-through — **not done**, no CIG test credentials available. Dev server verified to boot and compile with no errors up to the `/login` auth boundary. Deliberately did not attempt to log in or touch the seeded `cig@loanstar.local` account's password.

**Implementation note:** initially reached for a `useEffect` to re-derive the draft when the modal reopens, but ESLint's `react-hooks/set-state-in-effect` flagged it. Fixed by having the parent conditionally *mount* the modal only while `showCiForm` is true, so each open is a fresh mount and the draft can be a plain lazy `useState` initializer — no effect needed. Also fixed one unused-constant warning caught by the same lint pass.

---

## Phase 4 — Completeness gate

`assessVerificationCompleteness()` (`src/lib/cig/verification.ts`) required the 5 old fields before "Submit CI report" unlocked. Replaced with:

- PIC name, contact number, and relation filled
- Both Reference 1 and Reference 2: name, contact number, and relation filled
- All 4 `verification_checklist` items checked
- `pic_rating` given

**Checklist:**
- [x] Required-field subset used as proposed (no objection raised)
- [x] `assessVerificationCompleteness()` updated
- [x] Old checks for the 5 replaced fields removed
- [x] `src/lib/cig/workspace.ts` audited — no changes needed, it operates on the generic `missing: string[]` array rather than hardcoded field names, so it automatically reflects the new required-field messages
- [x] Required fields marked in the modal UI (`Label required`) so CI staff can see what's needed to submit before hitting the gate: PIC name/contact/relation, both references' name/contact/relation, the checklist, and the rating
- [x] Typecheck + ESLint re-verified clean after this change

---

## Phase 5 — Committee display rebuild

`src/app/committee/applications/[id]/page.tsx:579-624` currently renders the old flat fields. Rebuild to show:
- PIC's full verified info (not just 2 notes)
- Reference 1 and Reference 2 individually
- The verification checklist
- Payment preference
- Demeanor tags + rating + reason

**Checklist:**
- [x] `src/app/api/committee/applications/[id]/route.ts` — `SELECT` swapped from the 5 old columns to the 9 new ones, response mapping updated
- [x] Committee page local type (`CommitteeDetail.verification`) updated to match
- [x] PIC/reference render block rebuilt: PIC's full verified info, Reference 1 and Reference 2 shown independently, checklist (X/4 checked), payment preference, demeanor tags + rating + reason
- [x] Typecheck + ESLint clean (same pre-existing, unrelated errors only — the one new ESLint hit was the identical pre-existing `void load()` pattern already present on the CIG page, not something I introduced)
- [ ] Manual check: a submitted CI report renders correctly on the Committee side — **not done**, same credentials limitation as Phase 3. Verified only that the page compiles (typecheck + ESLint), not that it renders correctly with real data.

---

## Phase 6 — Verification pass

Done live against application `796363d1-b54d-4eed-98c8-7b16e10c2fdc` (Rovick M Romasanta, BN300002 — a seed/demo record; all its intake fields are clearly placeholder values like "Test Relation", "Test contact nos.", "Test facebook"), logged in via the login page's built-in "CIG" quick-login (seed accounts, no password entered/reset).

**What was actually confirmed, not just compiled:**
1. **Trigger + old cards removed**: the CIG workspace shows a single "CI & References Form" card with a "Not started" badge and an "Open CI & References Form" button — the old "PIC verification"/"Character references" cards are gone.
2. **Modal opens correctly**: title, info banner, all sections present in Sheet1 order (verified via full DOM dump) — I. Allottee/PIC Information (name, birthday, present/provincial address, contact, relation, other number, socials, email, work info, siblings with "Add sibling"), the 3 script-question blocks, housing/car loan, II. References (Reference 1 and Reference 2 fully independent, each with their own script questions and closing spill), Other Remarks (checklist, payment preference, demeanor, rating, verified by/date).
3. **Verbatim script text confirmed on screen**, e.g. exactly as rendered: *"Are you inform that he will avail the loan ?"*, *"Aside from LOAN STAR is there any other FINANCING / BANK that he applied for? For the last 4years?"*, *"Aside from us is there any person called for verification ?"*, *"\* Is this the first time that the Borrower used you as a Character Reference?"*, the closing-spill script, *"How the Person In charge dealt with the verification?"*, *"How will you rate PIC from 5 (highest) 1(lowest)"*.
4. **Prefill from CSA intake confirmed working** for both PIC and References: PIC name/contact/address/company info appeared prefilled from `borrowers.allottee`; Reference 1's name/contact/relation also prefilled from `borrowers.references_data[0]` — confirmed by the completeness list dropping "PIC name/contact/relation required" and all of "Reference 1 ... required" the moment the form loaded, with zero manual typing.
5. **Draft-save round trip confirmed for real**: edited PIC "Relation to the Client" to a unique marker value, clicked Save progress → network log showed `PATCH .../[id] → 200 OK` → did a **hard page reload** (not just closing/reopening the modal) → reopened the modal → the exact marker value was still there, proving real database persistence, not in-memory state.
6. **Completeness gate confirmed dynamic and correct**: the PATCH response's `completeness.missing` array updated live to drop exactly the fields that were now filled (PIC's 3 + all of Reference 1's), while correctly still listing Reference 2's 3 fields as missing (this seed borrower only declared one reference at intake) plus the still-untouched checklist/rating/finding — matching `assessVerificationCompleteness()`'s logic exactly.
7. **Test data cleaned up afterward**: cleared the marker value, then restored the PIC relation field to its original declared value ("Test Relation") via direct DB update, so the demo application was left exactly as found.

**Not done**: did not actually click "Submit CI report to Committee" (a real, less-reversible state transition on what looks like the user's own demo application) or fill out Reference 2/checklist/rating to trigger that flow, so the Committee-side rebuild (Phase 5) was verified structurally (types, lint, compile) but not by watching a real submitted report render on Committee's page. That would require either using a different disposable test application or explicit go-ahead to push this one through to Committee.

**Checklist:**
- [x] Draft-save round trip confirmed (real PATCH, real hard-reload persistence check)
- [x] Completeness gate confirmed (live, via actual API response before/after)
- [ ] Committee render confirmed — not done, would require submitting a CI report (see note above)
- [x] Script text verbatim confirmed (full DOM text dump, matches Sheet1 word-for-word)
- [x] Trigger card / old cards removed confirmed live
- [x] No console or server errors at any point during the walkthrough
- [x] Test data cleanup confirmed (marker value removed, original value restored)

---

## Post-launch changes (2026-07-24, same day, after user screenshot feedback)

**Round 1 — alignment/spacing bugs**, all in `src/components/cig/CiReferencesFormModal.tsx`:
- The ₱ peso glyph was rendering as a broken/fallback icon in the money-field prefixes (font-dependent glyph issue). Replaced with plain "PHP" text in `MoneyField` — glyph-safe everywhere, no dependency on font coverage.
- The "Other Financing" question had 5 fields crammed into a 3-column grid: the long verbatim label ("What company ? Was it FINANCING / BANK ?") wrapped to two lines and threw its input out of alignment with its shorter neighbors (When?/Start-End), and the trailing Loan Amount/Monthly pair sat orphaned with an empty gap in the same row. Restructured into three clean rows: company label alone (full width), When?/Start-End as an even pair, Loan Amount/Monthly as an even pair.
- Housing/Car Loan inner spacing normalized from `mt-2`/`gap-2` to `mt-3`/`gap-3` to match the rest of the form's rhythm.
- Added `items-end` to the three grids elsewhere pairing a short label with one that can wrap (the "anyone else called for verification?" Yes/No blocks, in both the PIC section and `ReferenceBlock`) so inputs stay level regardless of label height.
- Verified live via DOM inspection in the CIG session (affix text, grid child counts, `items-end` presence) — not just visual inspection.

**Round 2 — two more user-reported issues**:
1. **Siblings list spacing** — no gap between the "Siblings / Add sibling" header row and the first data row. Fixed by wrapping the sibling rows in a `mt-3 space-y-3` container (previously relied on a per-row `mb-2` that didn't apply above the first row).
2. **References changed from a fixed Ref 1/Ref 2 pair to a free add/remove list**, matching the Siblings pattern, per explicit user request:
   - `CiFormDraft.references` type changed from a `[ReferenceVerification, ReferenceVerification]` tuple to `ReferenceVerification[]`.
   - `ReferenceBlock` gained an `onRemove` prop and a "Remove" button in its header (index is now `number`, not `0 | 1`); no minimum enforced in the UI (consistent with Siblings allowing zero) — the "Add reference" button in the section header stays visible regardless of count.
   - `buildInitialDraft`: once anything has been saved, the saved array is respected exactly (including an explicitly-emptied list). Only on the very first open (nothing saved yet) does it seed from `borrower.references`, padded to at least 2 rows since Sheet1 expects two references by default.
   - API (`src/app/api/cig/applications/[id]/route.ts`): dropped the `.max(2)` cap on `referenceVerifications` in the Zod schema.
   - Completeness gate (`src/lib/cig/verification.ts`): changed from checking specific array positions 0/1 to counting how many entries anywhere in the list have name + contact number + relation filled, requiring at least 2. Message changed from separate "Reference 1/2 ... required" lines to one combined "At least 2 complete references required ... — N of 2 so far".
   - Verified live: added a 3rd reference (confirmed "Reference 3" card appears), removed it (confirmed it disappears cleanly, no index corruption), confirmed the sibling spacing fix in the live DOM. Did not save during this round, so no test-data cleanup was needed.

Typecheck and ESLint re-verified clean after both rounds — same 15 pre-existing, unrelated errors, 0 new.
