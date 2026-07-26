# Payment proof — optional file attach + View — Design Spec

**Date:** 2026-07-23  
**Status:** Draft for implementation (decisions locked; audit complete)  
**App:** LoanStar (`loanstar/`)  
**Scope:** Borrower payment proof optional attachment; View for Borrower, Collector, and AR

---

## 1. Goal

Let borrowers optionally attach a receipt/photo when submitting a payment proof, and let **Borrower, Collector, and AR** open/download that file — without changing Confirm/Reject, DCR batching, or AR posting rules.

---

## 2. Decisions (locked)

| Decision | Choice |
|---|---|
| File required? | **Optional** — amount/date/ref/channel still enough |
| Who can View? | **Borrower + Collector + AR** |
| File types (product) | Images + PDF + HEIC |
| Approach | Extend existing `payments` flow (not documents checklist; not new bucket) |

**Out of scope:** Required attach, multi-file, replace-after-submit, OCR, AR DCR `deposit_proof_path` upload UI, changing Confirm/Reject/Posted gates.

---

## 3. Audit summary (evidence)

### Already OK
- POST `/api/borrower/applications/[id]/loan` accepts optional `storagePath` / `fileName` and inserts into `payments.storage_path` / `file_name`.
- GET loan returns `payments` with `.select("*")` (includes path/name; UI ignores them).
- `payments` table already has nullable `storage_path`, `file_name` (`20260707000000_p7_ar_collection.sql`).
- Borrower can INSERT into `loan-documents` when path folder `[1]` = `borrowers.id`.
- AR already has `storage_ar_select` on `loan-documents`.
- Collector can SELECT/UPDATE `payments` metadata via table RLS; Confirm/Reject works.

### Gaps (block View / attach UX)
| Gap | Severity | Notes |
|---|---|---|
| Borrower UI has no file input; POST never sends path | High | `LoanActivePanel.tsx` |
| No payment download route | High | Do not reuse `/api/documents/[id]/download` (wrong entity + module list) |
| Collector has **no** `storage.objects` SELECT policy | High | Signed URL will fail for collectors |
| Collector `PAYMENT_SELECT` omits `storage_path` / `file_name` | Medium | Proofs page cannot know when to show View |
| AR masterlist UI ignores file fields (API already returns `*`) | Medium | Additive View link only |
| Bucket MIME allowlist is PDF/JPEG/PNG/WebP only | Medium | **HEIC not allowed today** — must extend bucket or drop HEIC |
| No path validation on POST | Medium | Enforce borrower-owned prefix |
| No `mime_type` on `payments` | Low | Infer from extension or optional column |

### Must not break
- Metadata-only submit (no file) must keep working exactly as today.
- Collector Confirm/Reject / DCR / AR post flows unchanged.
- Do not conflate `payments.storage_path` (borrower receipt) with `dcr.deposit_proof_path` (AR bank deposit proof).

---

## 4. Design

### Path convention
```
{borrowerId}/payments/{tempOrPaymentKey}/{safeFileName}
```
- First folder **must** be `borrowers.id` (matches `storage_borrower_insert`).
- Upload **before** payment insert (same pattern as `DocumentChecklist`): use timestamp temp key, then POST path with payment create.

### Upload (borrower)
1. Optional file pick (accept: pdf, jpeg, png, webp, heic — after bucket update).
2. Client uploads to `loan-documents`.
3. POST existing loan API with `storagePath` + `fileName` (+ optional mime if we add column).
4. No file → same body as today.

### Download
New payment-scoped routes (authorize via payments ownership / assignment / AR module), then `createSignedDownloadUrl`:
- Borrower: own payment
- Collector: assigned masterlist payment + `collection` view
- AR: `accounting_ar` view  

Or one shared helper + thin role-specific routes — prefer shared lib + one route under each portal that already has auth patterns.

### UI
- Borrower form: optional dropzone/file input; history **View** when path set.
- Collector proofs: **View** when path set; Confirm/Reject unchanged.
- AR masterlist payment timeline: **View** when path set.

### Storage RLS
Add collector SELECT on `loan-documents` (module `collection` view), mirroring AR policy breadth for v1 (simplest; path still gated by knowing `storage_path` from payments RLS).

### Bucket MIME
Migration to add `image/heic` (and `image/heif` if needed) to `loan-documents.allowed_mime_types`, keeping 10MB limit.

---

## 5. Success criteria

- [ ] Submit without file still creates `pending_verification` payment.
- [ ] Submit with file stores path/name; Borrower/Collector/AR can open signed URL.
- [ ] Collector without assignment cannot download another collector’s payment file.
- [ ] Confirm/Reject/DCR/post behavior unchanged.
- [ ] HEIC/PDF/JPEG/PNG/WebP accepted within 10MB after mime migration.
