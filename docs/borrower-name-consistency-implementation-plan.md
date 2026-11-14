# Borrower Name Consistency — Phased Implementation Plan

## Goal

Render every borrower name as `Last, First Middle` (or `Last, First` with no
middle name, or `Last` if given name is empty) using one shared formatter,
across every surface that currently builds a two-field `firstName lastName`
label or drops `middle_name` at the query level.

## Format contract

```ts
// src/lib/borrower-name.ts (done — commit 0dc08cb)
formatBorrowerName({ firstName, lastName, middleName }): string
// "Santos, Elena Reyes" | "Santos, Elena" | "Santos" | "Unknown borrower"
```

## Operating rules for every batch below

- **Surgical only.** Touch exactly the files listed in that batch. No
  drive-by refactors, renames, or formatting passes on untouched code.
- **No new database calls.** Where `middle_name` must be added to a query,
  add the column to the existing `select(...)` — do not introduce a new
  query, join, or round trip.
- **No schema/migration changes in this plan.** If a batch turns out to need
  one (e.g. a stored column doesn't exist), stop and report back instead of
  writing a migration.
- **Use the current schema only.** Field names below (`first_name`,
  `last_name`, `middle_name`) are taken from the code already read in this
  audit — verify they still match before editing if time has passed.
- **One batch = one commit.** Do not mix batches in a single commit.
- **Preserve existing behavior outside the exact name-rendering lines** —
  don't touch surrounding logic, props, or styling.
- Each batch is independently shippable and revertable.

## Phase 1 — Direct display/query code

### Batch 1 — Shared formatter ✅ DONE
- `src/lib/borrower-name.ts` — commit `0dc08cb`.

### Batch 2 — CSA ✅ DONE (commit `c26e20f`)
Files:
- [src/lib/csa/queue.ts:231](../src/lib/csa/queue.ts) — add `middle_name` to the `borrowers` select; thread through the returned type.
- [src/app/csa/page.tsx:174](../src/app/csa/page.tsx) — `queueBorrowerName()` → use `formatBorrowerName`.
- [src/app/csa/history/page.tsx:114](../src/app/csa/history/page.tsx)
- [src/app/csa/applications/[id]/page.tsx:636](../src/app/csa/applications/[id]/page.tsx) — application title + borrower card.
- CSA account-link dialog's displayed "current borrower name" (same file/module as above — locate via the dialog component, don't search outside CSA).

Constraint: do not touch `connect-borrower.ts` search matching/sort logic — only the displayed label.

### Batch 3 — CIG ✅ DONE (commit `996f611`)
Returned-to-CSA history tab stays two-field: its view
(`cig_return_to_csa_events`) does not expose `middle_name` — flagged in
code, not migrated. Also updated two test fixtures broken by the new
required `middleName` field (unrelated pre-existing fixture bugs around
`segment`/`VerificationRecord` left untouched).

Files:
- [src/app/cig/page.tsx:216](../src/app/cig/page.tsx)
- [src/app/cig/history/page.tsx:112](../src/app/cig/history/page.tsx)
- [src/app/cig/callbacks/page.tsx:112](../src/app/cig/callbacks/page.tsx) — including confirmation dialog label.
- [src/app/cig/denials/page.tsx:120](../src/app/cig/denials/page.tsx) — including confirmation dialog label.
- [src/app/cig/applications/[id]/page.tsx:743](../src/app/cig/applications/[id]/page.tsx) — borrower name only. The two-field **bank-account label** in this same file is a separate, unrelated format — do not touch it in this batch.

### Batch 4 — Committee ✅ DONE (commit `3b3f7c9`)
Approval/denial emails needed `middle_name` threaded from
`getApplicationForStaff` (already selected it, just wasn't passed) through
the three call sites (action, approve-without-sign, decision-email/resend
routes) into `ApprovalBorrower`/`DenialBorrower`.

Files:
- [src/app/committee/page.tsx:169](../src/app/committee/page.tsx)
- [src/app/committee/history/page.tsx:124](../src/app/committee/history/page.tsx)
- [src/app/committee/applications/[id]/page.tsx:713](../src/app/committee/applications/[id]/page.tsx)
- [src/lib/committee/approval-email.ts:27](../src/lib/committee/approval-email.ts)
- [src/lib/committee/denial-email.ts:27](../src/lib/committee/denial-email.ts)

Constraint: email templates — change only the name token's value, not subject lines, surrounding copy, or send logic.

### Batch 5 — LRA ✅ DONE (commit `088e7db`), with one deferral
`blri-data.ts`'s release-document `borrowerName` was **not** changed: it
feeds generated legal/financial documents via docxtemplater merge tags
(`template-context.ts:383,629`), and the actual `.docx` template's
required name order can't be verified from the repo (stored in Supabase
storage). Deferred to Batch 8 review rather than guessed.

Files:
- [src/app/lra/page.tsx:173](../src/app/lra/page.tsx)
- [src/app/lra/history/page.tsx:70](../src/app/lra/history/page.tsx)
- [src/app/lra/applications/[id]/page.tsx:1049](../src/app/lra/applications/[id]/page.tsx)
- [src/app/api/lra/applications/[id]/route.ts:38](../src/app/api/lra/applications/[id]/route.ts) — add `middle_name` to the borrower select; thread through the response type.
- [src/lib/lra/blri-data.ts:179](../src/lib/lra/blri-data.ts) — release-document context label.

Constraint: BLRI/release-document output may have its own formatting contract with the generated document — verify the document template still accepts the new string before changing it (per the audit's note on generated-document review).

### Batch 6 — Collector Briefings ✅ DONE (commit `1ecba65`)
Files:
- [src/app/collector/briefings/page.tsx:148](../src/app/collector/briefings/page.tsx) — queue + confirmation dialog.
- [src/app/api/collector/briefings/history/route.ts:74](../src/app/api/collector/briefings/history/route.ts) — currently formats the label server-side before sending; switch to `formatBorrowerName`, preserve the API response shape otherwise.

### Batch 7 — Reports / Audit / Notifications / SME duplication ✅ DONE (commit `d6e7a47`)
`sme-duplication.ts` got a local `displayOwnerName()` helper so match-result
labels use the shared formatter while `normalizePersonName`/`ownerKey`
matching stays on first/last only. Lead `ownerName` (free-form
`leads.borrower_name`) untouched — Phase 2 territory.

Files:
- [src/lib/reports/metrics/origination.ts:321](../src/lib/reports/metrics/origination.ts)
- [src/lib/audit/resolve.ts:160](../src/lib/audit/resolve.ts)
- [src/lib/notifications/workflow-events.ts:51](../src/lib/notifications/workflow-events.ts)
- [src/lib/csa/sme-duplication.ts:67](../src/lib/csa/sme-duplication.ts) — match-result labels only; do not touch matching/scoring logic.

### Batch 8 — Generated documents — ⏸ DEFERRED, not implemented
Evidence against reformatting: [promissory-note-preview.ts:74,81](../src/lib/documents/fidelity/promissory-note-preview.ts)
prints `{{borrowerName}}` directly above "Signature Over Borrower's Name"
on a signed legal document — this strongly implies the generated-document
family expects natural order (First Middle Last), not the UI's
`Last, First Middle` format. Applying the UI format here risks garbling
signed promissory notes, bank authorizations, computation sheets, and
receipts. User decision (2026-11-15): defer the entire batch rather than
guess; untouched for now. If this batch is revisited, the fix shape is
likely "add middle name, keep natural order" rather than the UI format —
confirm against each actual printed template first.

Files (none changed):
- [src/lib/documents/generators/application-form-context.ts:171](../src/lib/documents/generators/application-form-context.ts)
- [src/lib/documents/generators/bank-authorization.ts:20](../src/lib/documents/generators/bank-authorization.ts)
- [src/lib/documents/generators/final-computation-sheet.ts:152](../src/lib/documents/generators/final-computation-sheet.ts)
- [src/lib/documents/generators/payment-receipt.ts:124](../src/lib/documents/generators/payment-receipt.ts) — already middle-name-included, first-name-first; left as-is.
- [src/lib/lra/blri-data.ts:179](../src/lib/lra/blri-data.ts) — deferred from Batch 5 for the same reason; feeds `template-context.ts:383,629` (BLRI/bank-authorization merge context).

**Gate before Phase 2:** Retest using the CSA seed borrowers (one with a
recorded middle name, one blank) across every surface touched in Batches
2–7 (Batch 8 deferred, not in scope for this retest).

## Phase 2 — Shared data sources (requires decisions first, do not start blind)

These consumers read a stored or parsed string rather than structured
fields, so the fix shape is different and needs explicit decisions before
any code changes:

### Batch 9 — AR masterlist & servicing consumers
Files: `src/lib/ar/masterlist.ts:203`, `src/app/api/ar/queue/route.ts:21`,
`src/lib/ar/history.ts:201`, `src/app/api/collector/accounts/route.ts:206`,
`src/lib/collector/history.ts:197`, `src/app/api/remedial/accounts/route.ts:257`,
`src/lib/reports/register-queries.ts:98`.

Decision needed before starting: do existing `borrower_name` rows get
backfilled (migration — out of scope for this plan, needs separate
authorization), or does each consumer resolve display from the linked
borrower record with the stored string only as fallback for orphaned rows?

### Batch 10 — Agent leads, CSA leads, Dashboard pipeline
Files: `src/app/api/agent/leads/route.ts:119`, `src/lib/agent/queue.ts:230`,
`src/app/api/csa/leads/route.ts:56`, `src/lib/dashboard/aggregates.ts:269`,
`src/lib/csa/leads.ts:11`.

Decision needed: free-form `leads.borrower_name` can't reliably split into
first/middle/last (compound surnames, etc.) — confirm whether linked leads
should resolve from the structured borrower record and free-form/unlinked
leads keep the raw string un-reformatted, rather than attempting to parse it.

### Batch 11 — Search displays & legacy ingest
Files: `src/lib/agent/borrower-name.ts:7` (different module, given-name-first
— confirm whether this one is in scope to change or intentionally separate),
`src/lib/csa/connect-borrower.ts:61`, `src/lib/legacy-import/active-import.ts:32`,
`supabase/migrations/20261006234949_legacy_active_account_import.sql:158`.

Constraint: the migration file is historical — do not edit a migration
that has already run. Any fix here is forward-only (new migration or
application-level normalization), and needs separate authorization per
AGENTS.md before touching Supabase.

## Execution notes

- Work batch by batch, in order, inside Phase 1. Do not start a batch until
  the previous one is committed.
- After each batch, report: files touched, commit hash, anything skipped
  and why.
- Phase 2 does not start until Phase 1's gate is verified and the two
  decisions above are made explicitly.
