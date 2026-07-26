# Document checklist — Needs revision + remarks — Design Spec

**Date:** 2026-07-23  
**Status:** Approved for implementation (implemented 2026-07-23)  
**App:** LoanStar (`loanstar/`)  
**Scope:** CSA intake document checklist + borrower portal checklist + application hold linkage

---

## 1. Goal

Let CSA mark a checklist document as **needs revision**, attach **remarks** the borrower can see, keep the existing file on the row, put the application **On Hold** (hold reason = remarks), and let the borrower **Replace** when ready — without auto-clearing the hold.

Also add an explicit **Clear hold** action so CSA can resume intake without endorsing.

**Endorse hard lock:** Endorse is blocked while the application is On Hold **or** the intake checklist is incomplete (including any `needs_revision`).

---

## 2. Decisions (locked)

| Decision | Choice |
|---|---|
| File on request revision | **Keep** the current file |
| Document status | Set to **`needs_revision`** |
| Remarks | Required; shown on CSA + borrower checklist |
| Who can request | CSA, on **`uploaded`**, **`confirmed`**, and amend on **`needs_revision`** |
| Application status | Also **On Hold**; copy remarks → `blocker` / hold reason |
| After borrower Replace | Doc → **`uploaded`**; clear that row’s remarks; **app stays On Hold** |
| Clear hold | **Yes** — dedicated CSA Clear hold (does not require endorse) |
| Endorse while On Hold | **Hard lock (B)** — cannot endorse while status is `on_hold` **or** checklist incomplete (including any `needs_revision`) |

Out of scope: changing Confirm semantics (still only from `uploaded`), payment/QR/analytics, marketplace, unrelated portals (LRA/AR/CIG) beyond shared `DocumentChecklist` behavior.

---

## 3. Current baseline

- `documents.status` CHECK: `pending | uploaded | confirmed` (`20260706120000_p2_borrower_agent_documents.sql`).
- CSA confirms via `POST /api/documents/[id]/confirm` (uploaded → confirmed only).
- Borrower/CSA upload/replace via application documents routes; UI blocks upload when `status === "confirmed"`.
- Application hold via `POST /api/csa/applications/[id]/hold` → `file_holds` insert + `appendStatusHistory(..., "on_hold")` + `loan_applications.blocker = reason`.
- No dedicated clear-hold API today; blocker is cleared mainly on endorse / other stage transitions.
- Shared UI: `DocumentChecklist` (`src/components/DocumentChecklist.tsx`); CSA passes `confirmApiPath`.

---

## 4. Data model

### 4.1 Migration

On `public.documents`:

1. Drop/replace status CHECK to allow:

   `pending | uploaded | confirmed | needs_revision`

2. Add column:

   - `revision_remarks text null`

No change to `file_holds` shape; reuse existing hold recording.

### 4.2 Type / checklist mapping

- Extend `DocumentStatus` in `src/lib/documents/checklist.ts` with `"needs_revision"`.
- Checklist select/map includes `revision_remarks` → `revisionRemarks` on API items.
- Completion summary:
  - **complete** = confirmed only (unchanged).
  - **uploaded** count = `uploaded | confirmed` only (**not** `needs_revision`).
  - `needs_revision` counts as incomplete / not uploaded for endorse and progress.

---

## 5. API / server behavior

### 5.1 Request revision (new)

`POST /api/documents/[id]/request-revision`

- Auth: CSA intake edit (`requireModulePermission("intake", "edit")`).
- Body: `{ remarks: string }` — min length 3 (align with hold reason).
- Preconditions: document status is `uploaded`, `confirmed`, **or** `needs_revision` (amend remarks); row has a file (`storage_path` / non-pending).
- Effects (single document + application):
  1. Update document: `status = needs_revision`, `revision_remarks = remarks`; clear `confirmed_by` / `confirmed_at` if previously confirmed (so confirm metadata does not lie).
  2. Put application On Hold using the **same side effects as** existing hold route:
     - insert `file_holds` with `reason = remarks`
     - `appendStatusHistory(..., "on_hold", { note: remarks })`
     - set `loan_applications.blocker = remarks`
  3. If application is **already** `on_hold`: still update document + refresh `blocker` / insert another `file_holds` row with the new remarks (latest reason wins for display). Do not invent a second status.
- Audit: `execute_trigger` on document with before/after + remarks.
- UI: **View** remains available for `needs_revision` (file is kept).

### 5.2 Upload / Replace (existing borrower + CSA document POST)

When metadata update sets `status = uploaded` for a document that was `needs_revision` (or any replace):

- Set `status = uploaded`.
- Set `revision_remarks = null`.
- Do **not** change application status, `blocker`, or `file_holds`.

Also allow upload when status is `needs_revision` (UI + API): treat like replaceable uploaded, not like confirmed.

### 5.3 Confirm (existing)

Unchanged rule: only `uploaded` → `confirmed`.  
`needs_revision` cannot be confirmed until replaced (becomes uploaded).

### 5.3b Endorse hard lock (extend readiness + API)

`getEndorseReadiness` (and thus `POST .../endorse`) must treat the file as **not ready** when either:

1. Application `status === "on_hold"`, **or**
2. Intake checklist is incomplete (existing rule — required docs not all `confirmed`; `needs_revision` counts as incomplete).

Add an explicit missing string when on hold, e.g. `"Application is on hold — clear hold before endorsing"`.

UI: Endorse button stays disabled when readiness is not ready (already driven by `endorseReadiness.ready`).

So the path to endorse after a revision request is: borrower replaces → CSA confirms all required docs → CSA **Clear hold** → then Endorse.

### 5.4 Clear hold (new)

`POST /api/csa/applications/[id]/clear-hold`

- Auth: CSA intake edit; `assertCsaCanEdit`.
- Preconditions: application `status === "on_hold"`.
- Restore status:
  - Walk `status_history` from the end, skip trailing `on_hold` entries, take the latest prior status that is **not** `on_hold`.
  - If none found, fall back to `submitted` (safe CSA intake default).
- Effects:
  - `appendStatusHistory(..., restoredStatus, { note: "Hold cleared" })` (or equivalent clear note)
  - `loan_applications.blocker = null`
  - Do **not** delete historical `file_holds` rows (audit trail).
- Does **not** auto-confirm documents or clear remaining `needs_revision` rows — CSA may clear hold while docs still need work; endorse remains blocked until checklist is fully confirmed **and** status is not `on_hold`.
- Audit event on application / file_hold clear.

**Product rule:** Clear hold is manual. Replacing a needs-revision file never clears hold. Endorse requires both: hold cleared **and** checklist complete.

---

## 6. UI

### 6.1 Shared `DocumentChecklist`

- Map `needs_revision` to a warning / attention row state (not green “ok”).
- Subtitle when `needs_revision`: show remarks (e.g. “Needs revision: {remarks}”) and keep filename visible if present.
- **Upload/Replace** allowed when `needs_revision` (same as non-confirmed).
- **View** allowed when a file exists (`uploaded`, `confirmed`, or `needs_revision`).
- **Confirm** only when `uploaded` (existing helper).
- New optional prop, CSA only: `requestRevisionApiPath?: (documentId) => string` (mirror `confirmApiPath`).
- When set, show **Request revision** for `uploaded`, `confirmed`, and `needs_revision` (amend) rows (editable, not flags-only).
- Request revision opens a small dialog: required remarks textarea → POST → refresh checklist / parent callback.

### 6.2 CSA application detail

- Wire `requestRevisionApiPath` on intake `DocumentChecklist`.
- Endorse panel: add **Clear hold** button when `status === "on_hold"` (alongside existing Record hold). Confirm dialog optional but recommended (“Resume intake and clear hold reason?”).
- After request revision / clear hold, reload application payload so status badge, blocker, and endorse readiness refresh.

### 6.3 Borrower application detail + home

- No new API from borrower for revision request.
- Checklist already shared: borrower sees needs-revision state + remarks; can Replace.
- Home / detail hold reason display already shows `blocker` (unchanged).

### 6.4 CSA queue Blocker column

- Unchanged truncation behavior; new holds from revision remarks appear as blocker text.

---

## 7. Error handling

| Case | Response |
|---|---|
| Request revision without remarks / too short | 400 |
| Request revision on pending / no file | 403/400 |
| Request revision on already `needs_revision` | Allowed (update remarks + re-hold side effects) |
| Confirm while `needs_revision` | 403 (existing “only uploaded”) |
| Endorse while `on_hold` | 400 — missing includes on-hold message |
| Clear hold when not `on_hold` | 400 |
| Clear hold / revision without edit permission | 403 |

---

## 8. Testing

- Unit: checklist completion treats `needs_revision` as incomplete; upload clears remarks; status type covers new value.
- Unit: endorse readiness not ready when `on_hold` even if checklist otherwise complete.
- Unit: clear-hold restore picks last non-`on_hold` from history; fallback `submitted`.
- API / integration-style tests if present for confirm: add request-revision happy path + reject pending; clear-hold happy path.
- Manual: CSA request revision on confirmed → On Hold + remarks on borrower → Replace → uploaded, remarks gone, still On Hold (Endorse still blocked) → CSA confirms → Endorse still blocked until Clear hold → Clear hold → Endorse enabled when all gates pass.

---

## 9. Implementation outline (for plan)

1. Migration + types + checklist mapping/summary.
2. `POST .../request-revision` (reuse hold side effects via shared helper if practical).
3. Upload routes clear remarks when leaving `needs_revision`.
4. `POST .../clear-hold`.
5. Endorse readiness: block when `on_hold`.
6. `DocumentChecklist` UI + CSA wiring + Clear hold button.
7. Tests + light copy for borrower subtitle.

---

## 10. Non-goals

- Auto-clear hold when all docs re-uploaded or all confirmed.
- New application status beyond existing `on_hold`.
- Per-document hold table separate from `file_holds`.
- Changing who can Confirm (still CSA intake).
- Forcing application `for_revision` status (document-level `needs_revision` + app `on_hold` is enough).
- Auto-clear hold when endorsing is still fine as a side effect of endorse (blocker null), but endorse must not be reachable while still `on_hold`.
