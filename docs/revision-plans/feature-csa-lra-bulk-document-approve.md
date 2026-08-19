# Feature — Bulk shortcut: mark/confirm all documents (CSA + LRA)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one shortcut button on LRA generated documents and on each CSA intake checklist that applies the existing per-document staff action to every eligible document in that card, after a confirm dialog.

**Architecture:** LRA gets a dedicated sign-all backend that sequentially reuses `witnessSignGeneratedDocument` (no parallel POSTs, so the briefing advance cannot race). CSA reuses the existing per-document Confirm API from `DocumentChecklist` (no new confirm route). Visibility helpers stay pure and unit-tested.

**Tech Stack:** Next.js App Router, existing `ConfirmDialog`/`Button`, `witnessSignGeneratedDocument` patterns in `release-service.ts`, CSA `POST /api/documents/[id]/confirm`.

---

**Ground rules (apply to every phase, same as every other item in this workflow):**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- Do not change DB columns/tables — this item needs no migration.
- Do not add "Unmark all" / "Unconfirm all".
- Do not add Mark signed to CSA documents.
- Do not use the word "Approve" on these buttons (Committee already owns Approve).
- Run existing tests for the touched area after each phase; do not delete or weaken a test to make it pass.
- Execute phases **in order**. Each phase must leave the app green before the next starts.
- TDD: write the failing test first, watch it fail, then implement.
- At the end of all phases, output one combined summary: files changed, tests run/result, and anything you deliberately left alone that looked related.

## Background (from conversation, decided scope)

Staff want a shortcut so they do not click **Mark signed** / **Confirm** on every document during an in-branch session.

CSA and LRA do **not** share the same document action:

| Module | Staff document action today | What the shortcut must do |
|---|---|---|
| **LRA** | Per-row **Mark signed** on generated PDFs | Mark every unsigned generated document signed |
| **CSA** | Per-row **Confirm** on uploaded intake files | Confirm every uploaded file on that checklist card |

CSA never had document Mark signed. In-branch CSA papers (Declaration Form, Agency Consent, Data Privacy Consent, BAP Customer Consent, Clearance Form) are uploaded, then Confirmed. The old `POST /api/documents/[id]/sign` is retired (always 403).

## Audit findings (verified 2026-08-19)

### LRA — generated documents Mark signed

- UI: `src/app/lra/applications/[id]/page.tsx` (Generated documents card). **Mark signed** renders when `!doc.signedAt && rf.status === "awaiting_signatures"`. **Unmark signed** is already separate and stays per-row.
- API: `POST /api/lra/applications/[id]/documents/[docId]/sign` with `{ confirm: true }`. Permission: `release_lra` / `edit`.
- Backend: `witnessSignGeneratedDocument` in `src/lib/lra/release-service.ts` (~495–577):
  - Blocks if `is_finalized`, already `signed_at`, or `release_files.status !== "awaiting_signatures"`.
  - Sets `signed_at`, `signed_by` (borrower `user_id`), `witnessed_by` (LRA user), `signature_hash = content_hash`.
  - After **each** sign, if every `generated_documents` row for the release file has `signed_at`, advances `release_files.status` to `awaiting_briefing` and `syncApplicationBlocker(..., "awaiting_briefing", { applicationStatus: "release_briefing" })`.
- Eligible slugs (`src/lib/lra/constants.ts`): path union of BLRI, Promissory Note, Disclosure Statement, Letter of Intent, Loan Agreement, plus Check/AR Check (`with_pdc`) and/or Cash/AR ATM (`without_pdc`), plus collateral extras (Deed of Chattel Mortgage / Real Estate Mortgage). Dual-path files show 9 rows — the screenshot case.
- **Race if the UI fires N parallel POSTs:** several requests can all read "not yet all signed" and none (or two) would advance the file. A dedicated sign-all function that writes every signature, **then** checks `allSigned` once, is required.
- Not part of this card / out of scope: Employment contract upload, combined signed-scan upload, PDC collect, briefing acknowledge, Unmark signed.

### CSA — intake Confirm (the real document equivalent)

- UI: two `DocumentChecklist` cards on `src/app/csa/applications/[id]/page.tsx`:
  - **Borrower documents** (`excludeSlugs={CSA_ONLY_INTAKE_SLUGS}`)
  - **CSA documents** (`includeSlugs={CSA_ONLY_INTAKE_SLUGS}`)
- Both pass `confirmApiPath={(id) => `/api/documents/${id}/confirm`}`. **Confirm** is the only staff "this document is done" click. `allowSign` is never set (defaults false).
- Confirm visibility (`canShowConfirmAction` in `src/lib/documents/checklist-actions.ts`): `confirmApiPath` set, not readOnly/flagsOnly, has `documentId`, `status === "uploaded"`. Pending / needs_revision / already confirmed cannot be confirmed.
- API: `POST /api/documents/[id]/confirm`. Permission: `intake` / `edit`. Only `status === "uploaded"` may flip to `confirmed` (`confirmed_by`, `confirmed_at`).
- Confirm does **not** auto-endorse. Endorse stays a separate button gated on every required doc being confirmed.
- Only CSA pages pass `confirmApiPath`. Adding Confirm all inside `DocumentChecklist` when that prop is set does not leak the button to CIG / Committee / LRA / AR / Collector.
- CSA checklists are **not** gated on `editable` today (Confirm still shows after intake). Bulk Confirm must match that existing behavior — do not newly hide it behind `isCsaEditableStatus`.
- Out of scope: computation "Proceed without borrower's sign", Committee "Approve without borrower's sign", request-revision, uploads of missing files.

### Approaches considered

1. **Frontend-only sequential calls to the existing per-doc APIs.** Smallest CSA path. Unsafe for LRA if requests are parallel (stage-advance race). Sequential LRA would work but is slower and still N audit/status checks.
2. **Dedicated bulk APIs for both modules.** Correct for LRA. Extra CSA API is unnecessary because Confirm has no file-level auto-advance.
3. **Recommended split:** LRA dedicated `witnessSignAllGeneratedDocuments` (sequential calls to the existing per-doc function) + `POST .../documents/sign-all`. CSA Confirm all lives in `DocumentChecklist` and sequentially calls the existing confirm endpoint for that card's uploaded rows only.

## Scope decision

- **LRA button label:** `Mark all signed` (matches existing `Mark signed`). Confirm dialog required.
- **CSA button label:** `Confirm all` (matches existing `Confirm`). Confirm dialog required. One button per checklist card, scoped to that card's visible uploaded rows — clicking Confirm all on Borrower documents must not confirm CSA documents, and vice versa.
- **CSA cannot confirm files that were never uploaded.** Pending / needs_revision rows stay as they are.
- **LRA cannot mark docs signed unless `release_files.status === "awaiting_signatures"`.** Same gate as the per-row button. Already-signed rows are skipped. After the bulk write, if every generated doc is signed, advance to briefing exactly once (same as today's last per-row click).
- No Unmark all. No CSA Mark signed. No Employment contract / combined-upload changes. No migration.

---

## Phase 1 — Pure visibility helpers (TDD)

**Goal:** Encode who sees the new buttons, and which rows they apply to, as pure functions with tests. No UI or API yet.

### Files to change

1. **Create: `src/lib/lra/mark-all-signed.ts`**
2. **Test: `src/lib/lra/__tests__/mark-all-signed.test.mts`**
3. **Modify: `src/lib/documents/checklist-actions.ts`**
4. **Test: `src/lib/documents/__tests__/checklist-actions.test.mts`** (append; do not rewrite existing cases)

### Change to make

- [ ] **Step 1: Write the failing LRA helper tests**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canShowMarkAllSigned,
  unsignedGeneratedDocumentIds,
} from "../mark-all-signed";

describe("unsignedGeneratedDocumentIds", () => {
  it("returns only unsigned, non-finalized ids", () => {
    assert.deepEqual(
      unsignedGeneratedDocumentIds([
        { id: "a", signed_at: null, is_finalized: false },
        { id: "b", signed_at: "2026-08-19T00:00:00Z", is_finalized: false },
        { id: "c", signed_at: null, is_finalized: true },
      ]),
      ["a"],
    );
  });
});

describe("canShowMarkAllSigned", () => {
  it("shows only during awaiting_signatures when at least one unsigned doc remains", () => {
    assert.equal(
      canShowMarkAllSigned({
        releaseStatus: "awaiting_signatures",
        unsignedCount: 3,
      }),
      true,
    );
    assert.equal(
      canShowMarkAllSigned({
        releaseStatus: "awaiting_signatures",
        unsignedCount: 0,
      }),
      false,
    );
    assert.equal(
      canShowMarkAllSigned({
        releaseStatus: "awaiting_briefing",
        unsignedCount: 1,
      }),
      false,
    );
  });
});
```

- [ ] **Step 2: Run the LRA helper test and confirm it fails**

Run: `npm test -- src/lib/lra/__tests__/mark-all-signed.test.mts`
Expected: FAIL (module not found / exports missing)

- [ ] **Step 3: Implement the LRA helpers**

```ts
export function unsignedGeneratedDocumentIds(
  docs: Array<{ id: string; signed_at: string | null; is_finalized?: boolean | null }>,
): string[] {
  return docs
    .filter((doc) => !doc.signed_at && !doc.is_finalized)
    .map((doc) => doc.id);
}

export function canShowMarkAllSigned(opts: {
  releaseStatus: string | null | undefined;
  unsignedCount: number;
}): boolean {
  return opts.releaseStatus === "awaiting_signatures" && opts.unsignedCount > 0;
}
```

- [ ] **Step 4: Re-run the LRA helper test**

Run: `npm test -- src/lib/lra/__tests__/mark-all-signed.test.mts`
Expected: PASS

- [ ] **Step 5: Write the failing CSA helper tests** (append to `checklist-actions.test.mts`)

```ts
import {
  canShowConfirmAllAction,
  confirmableDocumentIds,
} from "../checklist-actions";

describe("confirmableDocumentIds", () => {
  it("returns ids for uploaded rows only", () => {
    assert.deepEqual(
      confirmableDocumentIds([
        { documentId: "u1", status: "uploaded" },
        { documentId: "c1", status: "confirmed" },
        { documentId: null, status: "pending" },
        { documentId: "r1", status: "needs_revision" },
      ]),
      ["u1"],
    );
  });
});

describe("canShowConfirmAllAction", () => {
  it("shows when confirm API is wired and at least one uploaded row exists", () => {
    assert.equal(
      canShowConfirmAllAction({
        hasConfirmApi: true,
        confirmableCount: 2,
      }),
      true,
    );
    assert.equal(
      canShowConfirmAllAction({
        hasConfirmApi: true,
        confirmableCount: 0,
      }),
      false,
    );
    assert.equal(
      canShowConfirmAllAction({
        hasConfirmApi: false,
        confirmableCount: 2,
      }),
      false,
    );
    assert.equal(
      canShowConfirmAllAction({
        hasConfirmApi: true,
        confirmableCount: 2,
        readOnly: true,
      }),
      false,
    );
  });
});
```

- [ ] **Step 6: Run checklist-actions tests and confirm the new cases fail**

Run: `npm test -- src/lib/documents/__tests__/checklist-actions.test.mts`
Expected: FAIL (exports missing)

- [ ] **Step 7: Implement the CSA helpers in `checklist-actions.ts`**

```ts
export function confirmableDocumentIds(
  items: Array<{ documentId: string | null; status: DocumentStatus | null }>,
): string[] {
  return items
    .filter((item) => item.documentId && item.status === "uploaded")
    .map((item) => item.documentId as string);
}

export function canShowConfirmAllAction(
  opts: { hasConfirmApi: boolean; confirmableCount: number } & Pick<
    ChecklistActionOpts,
    "readOnly" | "flagsOnly"
  >,
): boolean {
  return (
    opts.hasConfirmApi &&
    !opts.readOnly &&
    !opts.flagsOnly &&
    opts.confirmableCount > 0
  );
}
```

- [ ] **Step 8: Re-run checklist-actions tests**

Run: `npm test -- src/lib/documents/__tests__/checklist-actions.test.mts`
Expected: PASS (existing cases still pass)

### Validation checklist — Phase 1

- [ ] Helpers exist and tests pass.
- [ ] No UI, no API, no `release-service.ts` changes yet.
- [ ] `npx tsc --noEmit` clean.

### Status: Done (2026-08-19)

---

## Phase 2 — LRA backend: sign all generated documents

**Goal:** One function that witness-signs every unsigned generated document on the application's current release file, then advances to briefing at most once.

### Files to change

1. **Modify: `src/lib/lra/release-service.ts`** — add `witnessSignAllGeneratedDocuments` immediately after `witnessSignGeneratedDocument`. Do **not** change the per-document function. The bulk function must call it **sequentially** (a `for` loop, never `Promise.all`) so the existing last-doc briefing advance still runs exactly once, on the last unsigned document. Do not copy the signature-write / `syncApplicationBlocker` block.
2. **Test: `src/lib/lra/__tests__/mark-all-signed.test.mts`** — add stubbed service tests in this same file.

### Behavior (lock this)

```
witnessSignAllGeneratedDocuments(supabase, applicationId, witnessedById)
```

1. Load `release_files` for `loan_application_id = applicationId` (same lookup style as other release-service functions). Throw `"Release file is not in the signing stage"` unless `status === "awaiting_signatures"`.
2. Load `generated_documents` for that `release_file_id` (`id, signed_at, is_finalized`).
3. Compute `ids = unsignedGeneratedDocumentIds(docs)`. If empty, throw `"No unsigned documents"`.
4. For each id, `await witnessSignGeneratedDocument(supabase, id, witnessedById)` in order. The last call is what advances the file to `awaiting_briefing` when the set becomes complete — same as clicking Mark signed on the last remaining row.
5. Return `{ signedCount: ids.length, allSigned: result of the last call's allSigned (true if the set is now complete) }`.

Do not sign `is_finalized` rows (the helper already filters them). Do not create documents. Do not touch Unmark. Do not parallelize.

### Tests to add (stub supabase like `pdc-collect.test.mts`)

- [ ] **Step 1: Write failing tests first** covering:
  - Signs every unsigned doc and returns `signedCount` equal to that set; already-signed docs are left alone.
  - When the batch completes the set, `release_files.status` becomes `awaiting_briefing` **once** (on the last sequential per-doc call).
  - Mix: 2 unsigned + 5 signed → signs 2, then allSigned true.
  - Throws when status is not `awaiting_signatures`.
  - Throws when every doc is already signed.
- [ ] **Step 2: Run tests, confirm they fail**
- [ ] **Step 3: Implement `witnessSignAllGeneratedDocuments`**
- [ ] **Step 4: Re-run tests, confirm they pass**

Run: `npm test -- src/lib/lra/__tests__/mark-all-signed.test.mts`

### Validation checklist — Phase 2

- [ ] Per-document `witnessSignGeneratedDocument` source is behavior-unchanged (no new gates, no removed gates).
- [ ] Briefing advance happens at most once per bulk call.
- [ ] Existing `src/lib/lra/__tests__/*.mts` still pass.

### Status: Done (2026-08-19)

---

## Phase 3 — LRA API + UI

**Goal:** One header button on the Generated documents card, behind a confirm dialog, that calls the new bulk function.

### Files to change

1. **Create: `src/app/api/lra/applications/[id]/documents/sign-all/route.ts`**
2. **Modify: `src/app/lra/applications/[id]/page.tsx`**

### API

Mirror `documents/[docId]/sign/route.ts` POST:

- `requireModulePermission("release_lra", "edit")`
- Body: `{ confirm: true }` (same zod `z.object({ confirm: z.literal(true) })`)
- Call `witnessSignAllGeneratedDocuments(supabase, id, user.id)`
- Audit once:

```ts
await writeAuditEvent({
  actorId: user.id,
  moduleSlug: "release_lra",
  action: "execute_trigger",
  entityType: "release_file",
  entityId: id,
  afterData: {
    applicationId: id,
    trigger: "lra_witness_sign_all_release_docs",
    ...result,
  },
});
```

- Return `jsonOk(result)`. Zod errors → 400. Other errors → `handleApiError`.

### UI (Generated documents card only)

- Import `canShowMarkAllSigned` and `unsignedGeneratedDocumentIds` from `@/lib/lra/mark-all-signed`.
- Map `data.generatedDocuments` into `{ id, signed_at: doc.signedAt, is_finalized: false }` (page payload has `signedAt`, not `signed_at`).
- When `generatedDocsOpen` and `canShowMarkAllSigned({ releaseStatus: rf.status, unsignedCount })`, render a `Button variant="secondary" size="sm"` labeled **Mark all signed** at the top of the expanded list (inside the open content, not inside the collapse `<button>`).
- New state: `confirmSignAll` boolean, `signingAll` boolean. Reuse `setError` / `setMessage` / `load({ silent: true })` like `markDocSigned`.
- New `ConfirmDialog`:
  - title: `Record all remaining signatures?`
  - message: `Confirm the borrower has physically signed all remaining generated documents during the in-branch session. You are recorded as the witnessing LRA. You can still unmark individual documents before the briefing is acknowledged.`
  - confirmLabel: `Yes, mark all signed`
- `onConfirm` → `POST /api/lra/applications/${applicationId}/documents/sign-all` with `{ confirm: true }`. On success: close dialog, `setMessage("All remaining signatures recorded.")`, reload.
- Per-row Mark signed / Unmark signed / PDF stay as they are.

Do not add the button to Employment contract or Signed documents (combined upload).

### Validation checklist — Phase 3

- [ ] Button hidden when every generated doc is already signed, or status is not `awaiting_signatures`.
- [ ] Confirm dialog required — one click on the page button does not sign until the dialog is confirmed.
- [ ] After success on a file where every remaining doc was unsigned, the card shows all signed and the file is at awaiting briefing (same as clicking Mark signed on the last remaining doc).
- [ ] Dual-path 9-doc file marks all 9 (or however many were still unsigned).
- [ ] `npx tsc --noEmit` clean.

### Status: Done (2026-08-19)

---

## Phase 4 — CSA UI: Confirm all on each DocumentChecklist card

**Goal:** Each CSA checklist card that already has per-row Confirm also gets **Confirm all**, scoped to that card's visible uploaded rows, calling the existing confirm endpoint.

### Files to change

1. **Modify: `src/components/DocumentChecklist.tsx`**
2. **No change to `src/app/csa/applications/[id]/page.tsx`** — both cards already pass `confirmApiPath`; they pick up the button automatically.

### Change to make

- Import `canShowConfirmAllAction` and `confirmableDocumentIds` from `@/lib/documents/checklist-actions`.
- Compute against `visibleItems` (respects `includeSlugs` / `excludeSlugs`):

```ts
const confirmableIds = confirmableDocumentIds(visibleItems);
const showConfirmAll = canShowConfirmAllAction({
  hasConfirmApi: Boolean(confirmApiPath),
  confirmableCount: confirmableIds.length,
  readOnly,
  flagsOnly,
});
```

- State: `confirmAllOpen` boolean, `confirmingAll` boolean.
- When `isOpen && showConfirmAll`, render `Button variant="secondary" size="sm"` **Confirm all** above the `chk-list` (inside the open body, not inside the collapse header button).
- `ConfirmDialog`:
  - title: `Confirm all uploaded documents?`
  - message: `Mark all uploaded documents in this list as reviewed and complete? This counts them toward the endorsement checklist. Documents that are not uploaded yet, or that need revision, are not included.`
  - confirmLabel: `Yes, confirm all`
- `onConfirm` implementation:
  - Sequential `POST` to `confirmApiPath(id)` with `{}` for each id in `confirmableIds` (same as `handleConfirm`). Do not `Promise.all` — keep order and surface the first error.
  - After each success, set that row's `status` to `"confirmed"` in local state (same map as `handleConfirm`).
  - On first failure, stop, `setError`, leave remaining rows as they were (partial confirm is the same as clicking Confirm on some rows then stopping).
  - On full success, close dialog, `onUploadComplete?.()`, and `load({ silent: true })` when items are fetched (same as `handleConfirm`).
- Per-row Confirm / Request revision / Upload stay as they are.

Because only CSA passes `confirmApiPath`, CIG / Committee / LRA employment-contract / AR / Collector checklists must not show this button.

### Validation checklist — Phase 4

- [ ] Borrower documents Confirm all confirms only borrower-list uploaded rows.
- [ ] CSA documents Confirm all confirms only CSA-only slugs.
- [ ] Hidden when nothing in that card is `uploaded`.
- [ ] Hidden on checklists without `confirmApiPath`.
- [ ] Does not confirm `pending` or `needs_revision` rows.
- [ ] Endorse still requires every *required* doc confirmed — Confirm all does not bypass missing uploads.
- [ ] Existing `src/lib/csa/__tests__/endorse-documents.test.mts` and `checklist-actions.test.mts` still pass.
- [ ] `npx tsc --noEmit` clean.

### Status: Done (2026-08-19)

---

## Explicitly out of scope

- Computation witness-sign (`Proceed without borrower's sign`) and Committee `Approve without borrower's sign`.
- Adding document Mark signed to CSA.
- Unmark all / unconfirm all.
- LRA Employment contract, combined signed-scan upload, PDC, briefing.
- New DB columns, RLS changes, migrations.
- Changing Confirm to require `isCsaEditableStatus`.
- Parallelizing LRA sign-all writes in a way that races `allSigned`.

## How to test manually

1. **LRA:** Open a file at `awaiting_signatures` with several unsigned generated PDFs. Confirm **Mark all signed** appears. Cancel the dialog — nothing changes. Confirm it — every remaining row shows signed, last-doc briefing advance happens if the set is complete. Spot-check that **Unmark signed** still works on one row before briefing is acknowledged.
2. **LRA dual-path:** A 9-doc generated list (with_pdc + without_pdc) marks all remaining in one confirm.
3. **CSA:** Upload several borrower docs (leave them `uploaded`, not confirmed). **Confirm all** on Borrower documents confirms those only. CSA documents card is unchanged. Upload CSA-only docs, Confirm all on that card only. Leave one required doc unuploaded — Endorse stays blocked.
4. **Negative:** LRA button gone after all signed / once status is `awaiting_briefing`. CSA button gone when that card has no `uploaded` rows.

## Final combined summary (fill in after implementation)

- Files changed:
  - Created: `src/lib/lra/mark-all-signed.ts`, `src/lib/lra/__tests__/mark-all-signed.test.mts`, `src/app/api/lra/applications/[id]/documents/sign-all/route.ts`
  - Modified: `src/lib/documents/checklist-actions.ts`, `src/lib/documents/__tests__/checklist-actions.test.mts`, `src/lib/lra/release-service.ts` (`witnessSignAllGeneratedDocuments` only), `src/app/lra/applications/[id]/page.tsx`, `src/components/DocumentChecklist.tsx`
- Tests run / result: `mark-all-signed.test.mts` + `checklist-actions.test.mts` + `endorse-documents.test.mts` — 19 passed, 0 failed (2026-08-19)
- Deliberately left alone: CSA computation witness-sign, Committee approve-without-sign, Unmark all, Employment contract, combined scan upload, CSA application page (Confirm all is picked up via existing `confirmApiPath`), complete-set `allSigned: true` unit test (avoids live `createServiceClient`)
