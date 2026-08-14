# Feature — LRA: "AR ATM" voucher document (Revision Tracker 2, Item 6)

**Ground rules:**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- Do not touch `ar_check_voucher`'s generation condition or template — it already exists and already satisfies "AR Check when PDC selected," confirmed by audit. Do not re-implement it.
- Do not delete or alter any historical `generated_documents` row that already references `ar_cash_voucher` — this plan only changes what gets generated **going forward**.
- Do not touch the separate `ar_check_voucher_posting`/`ar_cash_voucher_posting` document types — those back the AR accounting-upload checklist, a different concept from LRA's auto-generated release documents, and are out of scope.
- Run existing tests after the change; do not weaken a test to make it pass.
- Output a summary at the end: files changed, migration(s), tests run/result.

## Background

Revision Tracker 2, Item 6: add "AR Check" alongside "AR Cash" and "AR ATM" as documents LRA's checklist can generate — AR Check when the release method includes PDC/check issuance, AR Cash when it's cash, AR ATM when ATM Surrender is selected, all three coexisting.

## Audit findings (verified 2026-08-14) — important scope correction

**Two of the three requested items already exist; the third needs a naming/mapping decision, not new infrastructure.**

- **"AR Check" is already fully done.** `ar_check_voucher` already exists as a `document_types` row and a published `document_templates` entry (`supabase/migrations/20260706120002_p2_seed_documents.sql:19`, `20260714022836_p8_seed_voucher_templates.sql:89-137`), and is already generated whenever `with_pdc` is a selected release path (`AUTO_GENERATED_SLUGS.with_pdc` in `src/lib/lra/constants.ts:14-22`, consumed generically by `generateReleaseDocuments()` in `src/lib/lra/release-service.ts`, which already supports the dual-path "both" generation shipped in Item 4). Nothing to build here.
- **This system has only two release methods, not three.** `ReleasePath = "with_pdc" | "without_pdc"` (`constants.ts:2`) — and `without_pdc` **is** what the UI itself already labels "ATM Surrender" (`src/app/lra/applications/[id]/page.tsx` checkbox label). There is no separate "plain cash" release method anywhere in the system, and confirmed no cash-vs-ATM distinction exists financially either — `buildReleaseTemplateContext` (`src/lib/lra/template-context.ts:116-118`) posts everything under `without_pdc` to the same GL code (`"1100110"`, label `"CASH"`); grepped all of `src/lib/ar/**` for any ATM-specific GL code or business logic — zero hits.
- **The actual gap**: `without_pdc` today generates `ar_cash_voucher` (`AUTO_GENERATED_SLUGS.without_pdc`, `constants.ts:23-31`), not an ATM-specific document — so "AR ATM generated when ATM Surrender is selected" isn't literally true today, even though `without_pdc` *is* the ATM Surrender path. `ar_cash_voucher`'s template (`20260714022836_p8_seed_voucher_templates.sql`) is near-identical to `ar_check_voucher`'s — same merge fields, only the heading text differs ("AR CHECK VOUCHER" vs "AR CASH VOUCHER") — trivially cloneable for a new `ar_atm_voucher`.
- **Decision for this plan**: since `without_pdc` already **is** the ATM Surrender method (not a generic cash method), the correct fix is to generate `ar_atm_voucher` in place of `ar_cash_voucher` going forward for that path — a relabeling to match what the path actually represents, not the addition of a third release method. "AR Cash," as a document tied to a genuinely separate all-cash disbursement method, has no trigger condition anywhere in this codebase today and would require inventing a third `ReleasePath` value — a much larger change (mirroring everything Item 4 just widened from 2 values to a set) that isn't requested by anything else in this revision batch. **This plan delivers AR Check (already done) + AR ATM (new); "AR Cash" as a literally-distinct document is flagged as out of scope, not silently dropped** — surface this explicitly to the client/user before considering the item fully closed.

## Scope decision

Single phase — this is small: one new document type + template (cloned from the existing cash voucher), one slug swap in `AUTO_GENERATED_SLUGS`.

---

## Phase 1 — Add `ar_atm_voucher` document type + template, swap it into `without_pdc`

### Files to change

1. **New migration file**, applied via Supabase MCP `apply_migration` to both migration folders:
   ```sql
   INSERT INTO public.document_types (slug, label)
   VALUES ('ar_atm_voucher', 'AR ATM Voucher');
   ```
   Then insert a `document_templates` row for `ar_atm_voucher`, cloning `ar_cash_voucher`'s current published body verbatim (query it live first via Supabase MCP, do not retype it from the migration file by hand — confirm the exact live-published version, since templates may have been edited via the admin UI since seeding) with only the `<h3>` heading text changed from "AR CASH VOUCHER" to "AR ATM VOUCHER". Set `status: 'published'`, `published_at: now()` — mirror the exact column shape of the existing `ar_cash_voucher`/`ar_check_voucher` rows (query `document_templates` for one of them first to confirm current columns before writing the INSERT).
   - Do not modify or remove the existing `ar_cash_voucher` document type or template — it stays in the system (historical documents still reference it), it just stops being the thing newly generated for `without_pdc`.
2. **`src/lib/lra/constants.ts`** — in `AUTO_GENERATED_SLUGS.without_pdc` (`:23-31`), replace `"ar_cash_voucher"` with `"ar_atm_voucher"`. Do not touch `.with_pdc`.

### Validation checklist — Phase 1

- [x] `document_templates` has a new `ar_atm_voucher` row (published version); content matches the cash voucher's body except the heading.
- [x] Generating documents for a `without_pdc` (or "both") release now produces `ar_atm_voucher`, not `ar_cash_voucher`.
- [x] Generating documents for a `with_pdc`-only release is completely unaffected (`ar_check_voucher` unchanged).
- [x] Historical `generated_documents` rows referencing `ar_cash_voucher` from before this change are untouched (the template row itself was left in place, not deleted).
- [x] `npx tsc --noEmit` clean.
- [x] Existing test suite still passes.

### Status: Done (2026-08-14)

Correction from Cursor, verified and correct: the plan's `document_types` INSERT instruction was wrong — that table is a separate, legacy concept (borrower-upload checklist slots), unrelated to the template-engine-driven auto-generation path this feature actually uses. `getPublishedTemplate()` (`src/lib/documents/templates/service.ts:146-171`) only ever queries `document_templates`/`document_template_versions` by slug — confirmed directly, no `document_types` dependency exists for LRA's auto-generated documents. Cursor used the right mechanism.

Live-verified the template body is byte-for-byte identical to `ar_cash_voucher`'s live-published body except the `<h3>` heading text — exactly as specified, not a hand-retyped approximation. Confirmed the code change is a precise one-line swap (`with_pdc` untouched), migration filename matches the live-tracked Supabase version (no drift, mirrored correctly in both folders), and the two updated test files assert the actual new behavior (positive `ar_atm_voucher` + negative `!ar_cash_voucher` checks), not just mechanical fixes. `tsc` clean, 902/902.

---

## Final validation

- [x] Full test suite run — no new failures (902/902, re-run independently on the feature branch, 2026-08-14).
- [x] Code-level validation: migration diffed against the live DB (template body byte-identical to source), `AUTO_GENERATED_SLUGS` diff confirmed minimal (one line), migration filename tracking confirmed correct.
- [ ] Live click-through: generate documents for a fresh `without_pdc` (ATM Surrender) release, a fresh `with_pdc` release, and a "both" release — confirm the right voucher(s) appear each time. Not yet done by Claude — left for the user.
- [ ] Confirm with the user/client whether "AR Cash" (as a document tied to a genuinely separate all-cash release method) is actually needed — if so, that's new scope beyond this plan (a third release method), not something this phase covers.
