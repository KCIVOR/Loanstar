# Feature — Allow undoing a document signature before the briefing stage begins

**Ground rules (apply to every phase, same as every other item in this workflow):**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- Do not change DB columns/tables — this item needs no migration (reuses existing `generated_documents`/`release_files`/`briefings` columns).
- Run existing tests for the touched area after each phase; do not delete or weaken a test to make it pass.
- Execute phases **in order**. Each phase must leave the app green (tests passing) before the next starts.
- At the end of all phases, output one combined summary: files changed, tests run/result, and anything you deliberately left alone that looked related.

## Background (from conversation, decided scope)

LRA's "Generated documents" card lets staff click "Mark signed" per document during the in-branch signing session. There is currently no way back — once clicked, `witnessSignGeneratedDocument` (`src/lib/lra/release-service.ts:394-476`) is one-directional, and the confirm dialog even says "This cannot be undone."

Agreed scope: add an "Unmark signed" action, allowed **as long as the file hasn't reached the briefing stage yet** — meaning:
- Freely allowed while `release_files.status === "awaiting_signatures"` (not all docs signed yet).
- Still allowed the moment *all* docs just got signed and the file auto-advanced to `awaiting_briefing`, **provided the actual briefing hasn't been acknowledged by the Collector yet** (`briefings.acknowledged_at IS NULL`) — undoing in this window must also roll the file's stage back from `awaiting_briefing` to `awaiting_signatures`.
- **Blocked** once the briefing has been acknowledged, or the file has moved further (`ready_release`, `released`, `closed`) — by then downstream work already depends on the signed package being complete; unsigning there needs a manual/DB-level correction (same category as the PDC revert done earlier this session), not a UI button.

## Audit findings (verified 2026-08-12)

- `witnessSignGeneratedDocument` (`release-service.ts:394-476`):
  - Requires `release_files.status === "awaiting_signatures"` to sign at all (line 418).
  - Sets `generated_documents.signed_at`, `signed_by` (borrower's `user_id`), `witnessed_by` (the LRA user), `signature_hash` (lines 436-444).
  - After the update, checks `allSigned = every doc has signed_at` (line 455); if true, advances `release_files.status` to `awaiting_briefing` (lines 457-465) **and** calls `syncApplicationBlocker(admin, loanApplicationId, "awaiting_briefing", { actorId, applicationStatus: "release_briefing" })` (lines 467-472) — this both sets `loan_applications.blocker` to `BLOCKER_BY_STATUS.awaiting_briefing` **and** advances `loan_applications.status` to `"release_briefing"` (via `appendStatusHistory`, since `syncApplicationBlocker` — `src/lib/lra/blockers.ts:10-33` — writes status history whenever `applicationStatus` is passed).
  - `doc.is_finalized` (only ever set `true` at file Close, `release-service.ts:766`) already blocks re-signing; the same guard is the right block for unsigning too.
- `BLOCKER_BY_STATUS` (`src/lib/lra/constants.ts:46-55`) has `awaiting_signatures: "Pending: document signatures"` — the exact blocker text to restore on rollback.
- `loan_applications.status` values through this part of the pipeline, confirmed via `release-service.ts:75,471,560,690,791`: `release_signing` → `release_briefing` → `release_ready` → `released` → `closed`. Rolling back from `awaiting_briefing` means restoring `release_signing`.
- Briefing row already exists by this point (created earlier via `.from("briefings").upsert(...)` at `release-service.ts:372`, at document-generation time) — unsign doesn't need to create/delete it, just read `acknowledged_at` on it to decide if rollback is still safe.
- Frontend (`src/app/lra/applications/[id]/page.tsx`): "Mark signed" only renders when `!doc.signedAt && rf.status === "awaiting_signatures"` (lines 1074-1085). `data.briefing?.acknowledged_at` is already available on the page (used at lines 530, 553) — no new data fetch needed to gate the new button.
- This item covers only documents signed via the per-document "Mark signed" witness click (`generated_documents.signed_at` / the `/documents/[docId]/sign` route). The separate `signing-documents/combined-upload` route (referenced at page.tsx lines 192, 426) is a different upload-based flow — out of scope, not touched.

## Scope decision

1. **Backend** — new `unwitnessSignGeneratedDocument` in `release-service.ts`, the mirror of `witnessSignGeneratedDocument`: clears the document's signature fields, and — only when the file had already advanced to `awaiting_briefing` with no briefing acknowledgment yet — rolls `release_files.status` back to `awaiting_signatures` and `loan_applications.status`/`blocker` back to `release_signing`/"Pending: document signatures". Hard-blocks (throws) once briefing is acknowledged or the file is past that stage.
2. **API** — add a `DELETE` handler to the existing `/api/lra/applications/[id]/documents/[docId]/sign/route.ts` (same resource, opposite verb — matches REST convention, no new route file needed).
3. **Frontend** — add an "Unmark signed" button next to any signed document, visible when `rf.status === "awaiting_signatures"` OR (`rf.status === "awaiting_briefing" && !data.briefing?.acknowledged_at`); wire it through its own confirm dialog; correct the existing "Mark signed" dialog's now-inaccurate "This cannot be undone" copy.

---

## Phase 1 — Backend: the reverse action

**Goal:** A single function that safely undoes a signature, with the correct rollback when it was the signature that had advanced the file to the briefing stage, and a hard, clear refusal once that's no longer safe.

### Files to change

1. **`src/lib/lra/release-service.ts`**
   - Add `export async function unwitnessSignGeneratedDocument(supabase: SupabaseClient, documentId: string, actorId: string)`, placed directly after `witnessSignGeneratedDocument` (after line 476):
     - Fetch the document the same way `witnessSignGeneratedDocument` does: `select("*, release_files ( loan_application_id, status )")`, unwrap `release_files` (array-or-object, same pattern as line 413-416).
     - Throw `"Document not found"` if missing.
     - Throw `"Document is not signed"` if `!doc.signed_at`.
     - Throw `"Document not available for unsigning"` if `doc.is_finalized`.
     - If `releaseFile.status === "awaiting_signatures"`: no rollback needed, proceed straight to clearing the signature fields below.
     - Else if `releaseFile.status === "awaiting_briefing"`: look up the briefing row (`select("acknowledged_at").eq("release_file_id", doc.release_file_id).maybeSingle()`); if `acknowledged_at` is set, throw `"Briefing has already been acknowledged — signature can no longer be undone"`. If not set, this is the rollback path — proceed, and after clearing the document, use `createServiceClient()` (same admin-privilege pattern as the sign path, lines 458-472) to: update `release_files.status` back to `"awaiting_signatures"`, then call `syncApplicationBlocker(admin, releaseFile.loan_application_id, "awaiting_signatures", { actorId, applicationStatus: "release_signing" })`.
     - Else (any other status — `ready_release`, `released`, `closed`): throw `"Release file has moved past the signing stage — signature can no longer be undone"`.
     - Clear the document: `update({ signed_at: null, signed_by: null, witnessed_by: null, signature_hash: null }).eq("id", documentId)`, same error-throw-on-failure pattern as the sign path (lines 436-448).
     - Return `{ unsigned: true, rolledBackToSigning: <boolean> }`.
   - Do not modify `witnessSignGeneratedDocument` itself or any other exported function in this file.

### Validation checklist — Phase 1

- [ ] Unsigning a document while `release_files.status === "awaiting_signatures"` clears its signature fields and does nothing else (no status change).
- [ ] Unsigning the document that had just completed the set (file at `awaiting_briefing`, briefing not yet acknowledged) clears its fields **and** rolls `release_files.status` back to `awaiting_signatures`, `loan_applications.status` back to `release_signing`, and `loan_applications.blocker` back to `"Pending: document signatures"`.
- [ ] Attempting to unsign once the briefing is acknowledged throws a clear error and changes nothing.
- [ ] Attempting to unsign once the file is at `ready_release`/`released`/`closed` throws a clear error and changes nothing.
- [ ] Attempting to unsign an already-unsigned or `is_finalized` document throws a clear error.
- [ ] No changes to `witnessSignGeneratedDocument` or any other function in `release-service.ts`.
- [ ] `npx tsc --noEmit` clean.
- [ ] Existing full test suite still passes.

### Status: Done (2026-08-12)

---

## Phase 2 — API: expose the reverse action

**Goal:** A `DELETE` on the existing sign endpoint triggers the new backend function, following the same auth/audit conventions as the `POST` handler right above it.

### Files to change

1. **`src/app/api/lra/applications/[id]/documents/[docId]/sign/route.ts`**
   - Add `export async function DELETE(request: Request, { params }: RouteParams)`, mirroring the existing `POST` handler exactly: same `requireModulePermission("release_lra", "edit")` check, same document/`release_files` lookup and `id` match guard (lines 21-32), calling `unwitnessSignGeneratedDocument(supabase, docId, user.id)` instead of the sign function.
   - Write the same shape of audit event as `POST` (lines 36-47), with `action: "update"` and `trigger: "lra_unwitness_sign_release_doc"` (distinct trigger name from the sign action's `"lra_witness_sign_release_doc"`).
   - Reuse `handleApiError` for error responses, same as `POST` — no new error-status branching needed (these are ordinary thrown-Error cases, not a special HTTP status like the old PDC shortfall 409).
   - Do not change the existing `POST` handler.

### Validation checklist — Phase 2

- [ ] `DELETE /api/lra/applications/[id]/documents/[docId]/sign` calls `unwitnessSignGeneratedDocument` and returns its result via `jsonOk`.
- [ ] Same permission gate (`release_lra`, `edit`) as `POST`.
- [ ] Audit event written with a distinct trigger name from the sign action.
- [ ] `POST` handler byte-identical to before.
- [ ] `npx tsc --noEmit` clean.
- [ ] Manual/API check: `DELETE` on a signed doc while `awaiting_signatures` succeeds; on a doc that would roll the file back from `awaiting_briefing` succeeds and the response reflects it; on an already-acknowledged-briefing file returns a clear error, not a 500.

### Status: Done (2026-08-12)

---

## Phase 3 — Frontend: the "Unmark signed" control

**Goal:** LRA staff can undo a signature from the same "Generated documents" card, gated to exactly the allowed window, with its own confirmation step.

### Files to change

1. **`src/app/lra/applications/[id]/page.tsx`**
   - Add `unmarkDocSigned(docId: string)` alongside the existing `markDocSigned` (after line 361): same shape (`setSigningDocId`, `setError`, try/catch, `await load({ silent: true })`), but calling `DELETE` instead of `POST` on `/api/lra/applications/${applicationId}/documents/${docId}/sign` (no request body needed, matching the DELETE handler added in Phase 2). Success message: `"Signature undone."`
   - Add `confirmUnsignDoc` state (mirroring `confirmSignDoc` at line ~154) to drive a second `ConfirmDialog`.
   - In the document row (lines 1063-1087), add the new button next to the existing conditional "Mark signed" button: when `doc.signedAt` is set AND (`rf.status === "awaiting_signatures" || (rf.status === "awaiting_briefing" && !data.briefing?.acknowledged_at)`), render an "Unmark signed" `Button` (`variant="secondary"`, `size="sm"`, same `loading={signingDocId === doc.id}` wiring) that opens the new confirm dialog via `setConfirmUnsignDoc({ id: doc.id, slug: doc.slug })`.
   - Add the second `ConfirmDialog` alongside the existing one (after line 1113): title e.g. "Undo recorded signature?", message explaining the borrower will need to sign again in-branch, and — when this is the last-signed document (i.e. `rf.status === "awaiting_briefing"`) — an extra line noting the file will move back to the signing stage. `onConfirm` calls `unmarkDocSigned`.
   - Update the existing "Mark signed" `ConfirmDialog` message (lines 1093-1113): remove or rewrite "This cannot be undone." since it no longer is, while it's still true; keep everything else in that dialog as-is.
   - Do not touch any other section of this page (PDC encoding, release, briefing, close, etc.).

### Validation checklist — Phase 3

- [ ] "Unmark signed" appears only on signed documents, only while `awaiting_signatures`, or `awaiting_briefing` with no briefing acknowledgment yet.
- [ ] It does **not** appear once the briefing is acknowledged, or the file has moved to `ready_release`/`released`/`closed`.
- [ ] Confirming it clears the signature and, when applicable, visibly moves the pipeline stepper back from "Briefing" to "Sign".
- [ ] "Mark signed" dialog copy no longer claims the action is irreversible.
- [ ] Manual/API check on a live application: sign all 7 docs (reaching `awaiting_briefing`, matching the screenshot state), confirm "Unmark signed" is available on at least one document, use it, and confirm the file is back at `awaiting_signatures` with that one document showing "Awaiting in-branch signature" again and the other 6 still signed.
- [ ] `npx tsc --noEmit` clean.

### Status: Done (2026-08-12)

---

## Explicitly out of scope for this feature

- The `signing-documents/combined-upload` flow — a separate document-upload path, not touched.
- Any change to what happens once the briefing is acknowledged or the file is past that stage — those cases stay hard-blocked, matching the agreed "not on briefing phase yet" boundary; a correction past that point stays a manual/DB-level fix, same category as this session's earlier PDC revert.
- Any change to `witnessSignGeneratedDocument`'s forward behavior, `acknowledgeBriefing`, `recordRelease`, or the Close flow.
- Any change to `generateReleaseDocuments` or document generation itself.

## Final combined validation (after all three phases land)

- [ ] Full test suite run — no new failures.
- [ ] Manual walk-through on a live `with_pdc` application: sign a few documents, unmark one (still at `awaiting_signatures` — should be trivial), sign the rest to reach `awaiting_briefing`, unmark the last one (should roll the file back), re-sign it, then have the Collector acknowledge the briefing and confirm "Unmark signed" no longer appears anywhere on the card.

## Status: Done (2026-08-12)
