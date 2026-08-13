# Feature — Split CSA intake checklist into "Borrower documents" and "CSA documents"

**Ground rules:**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing the listed file.
- Do not modify `src/components/DocumentChecklist.tsx` — its existing `excludeSlugs`/`includeSlugs` props already do everything this needs (see Audit findings).
- Run existing tests after the change; do not delete or weaken a test to make it pass.
- At the end, output a summary: files changed, tests run/result.

## Background (from conversation, decided scope)

The CSA intake checklist already correctly enforces, at the API/upload level, that 5 of the 11 seafarer intake documents (Clearance Form, Declaration Form, Agency Consent Letter, Data Privacy Consent, BAP Customer Consent) are CSA-only — signed in person at the branch, uploaded by CSA, hidden/blocked from the borrower and agent portals (`CSA_ONLY_INTAKE_SLUGS`, `src/lib/documents/csa-only-intake.ts`, already implemented and validated per `docs/revision-plans/item-03-04-borrower-document-scope.md`).

However, on the CSA side itself, all 11 items render in **one single flat list** with no visual distinction — CSA staff currently have no on-screen cue for which documents the borrower is responsible for vs. which ones CSA collects itself. User asked to visually separate them into two sections, borrower documents first, CSA documents below.

## Audit findings (verified 2026-08-15)

- `src/app/csa/applications/[id]/page.tsx:1154-1173` renders exactly one `<DocumentChecklist>` for `stage="intake"`, fetching the full unfiltered list from `checklistApiPath={/api/csa/applications/${applicationId}/checklist?stage=intake}` (this route does not call `excludeCsaOnlyIntakeItems` — confirmed, CSA sees all 11 items).
- `src/components/DocumentChecklist.tsx` already supports exactly the filtering needed for a split, with existing, already-used precedent elsewhere in the codebase:
  - `excludeSlugs?: readonly string[]` — hides rows whose `documentTypeSlug` is in the list. Used today at `src/app/borrower/applications/[id]/page.tsx:387` and `src/app/agent/leads/[id]/page.tsx:259`.
  - `includeSlugs?: readonly string[]` — shows only rows whose `documentTypeSlug` is in the list. Used today at `src/app/lra/applications/[id]/page.tsx:1316`.
  - Both props filter client-side after the component's own fetch — no backend change needed, no new API route needed.
- `CSA_ONLY_INTAKE_SLUGS` (`src/lib/documents/csa-only-intake.ts`) is a plain constant array with no server-only dependencies — safe to import directly into this `"use client"` page.
- The component supports `title`/`description` overrides and its own `collapsible`/`defaultCollapsed` behavior per instance — two independent `<DocumentChecklist>` instances is the established pattern for "multiple checklists on one page" (the prop comment at `DocumentChecklist.tsx:57` literally says *"Override the card heading — required when the same page mounts more than one checklist"*).

## Scope decision

One phase — reuse existing component props, no new plumbing required.

---

## Phase 1 — Split the CSA intake checklist into two panels

**Goal:** CSA staff see two clearly separated panels on the application page: "Borrower documents" (the 6 borrower-facing items) above, "CSA documents" (the 5 branch-signed items) below — same data source, same upload/confirm behavior as today, purely a rendering split.

### Files to change

1. **`src/app/csa/applications/[id]/page.tsx`**
   - Add `import { CSA_ONLY_INTAKE_SLUGS } from "@/lib/documents/csa-only-intake";` near the existing `@/lib/documents/checklist` type import (`:31`).
   - Replace the single `<DocumentChecklist>` at `:1155-1172` with **two** instances, both keeping every existing prop (`applicationId`, `borrowerId`, `stage="intake"`, `checklistApiPath`, `uploadApiPath`, `confirmApiPath`, `requestRevisionApiPath`, `viewApiPath`, `onUploadComplete`) unchanged:
     - **First instance** — borrower documents:
       - `title="Borrower documents"`
       - `description="Documents the borrower is responsible for uploading. Confirmed documents count toward endorsement."`
       - `excludeSlugs={CSA_ONLY_INTAKE_SLUGS}`
     - **Second instance** — CSA documents:
       - `title="CSA documents"`
       - `description="Signed in person at the branch — CSA uploads these on the borrower's behalf. Clearance Form is optional."`
       - `includeSlugs={CSA_ONLY_INTAKE_SLUGS}`
   - Do not change `checklistApiPath` or any other prop — both instances still fetch the same full, unfiltered 11-item response from the CSA checklist route; the split happens entirely via `excludeSlugs`/`includeSlugs`, matching the existing pattern used elsewhere in this codebase (do not build a new API route or fetch-once-and-split mechanism — unnecessary given these props already exist for exactly this).
   - Do not touch `src/components/DocumentChecklist.tsx`, `src/app/api/csa/applications/[id]/checklist/route.ts`, or any other file.

### Validation checklist — Phase 1

- [x] CSA application page shows two separate panels under the intake section: "Borrower documents" (6 items: House Sketch, Valid IDs, Passport, Seaman's Book, 2x2 Picture, Contract) and "CSA documents" (5 items: Clearance Form, Declaration Form, Agency Consent Letter, Data Privacy Consent, BAP Customer Consent).
- [x] Every item still appears in exactly one of the two panels — no duplicate, no item missing from both.
- [x] Upload, confirm, request-revision, and view actions on every item in both panels still work exactly as before (same underlying API routes, unchanged).
- [x] Endorsement readiness (`getEndorseReadiness`) is unaffected — this is purely a display split, the completeness check still reads the full checklist, not either panel individually.
- [ ] `npx tsc --noEmit` clean.
- [x] Existing test suite still passes.

### Status: Done (2026-08-13)

---

## Explicitly out of scope

- Any change to `DocumentChecklist.tsx`, `csa-only-intake.ts`, or any API route — this is a page-level rendering change only, reusing existing, already-tested filtering props.
- Any change to which slugs are borrower-facing vs. CSA-only (that's `item-03-04-borrower-document-scope.md`'s scope, already done).
- Any other page (borrower's own view, agent view, CIG/Committee/LRA views) — this plan is CSA's application detail page only.

## Final validation

- [x] Full test suite run — no new failures.
- [ ] Live check on a real seafarer application: both panels render correctly, all upload/confirm actions still function, endorsement readiness still gates on the full 11-item set as before.

### Final validation status: Done (2026-08-13)
