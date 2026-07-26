# Payment Proof Optional File Attach — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optional borrower receipt attach on payment proof submit, with View/download for Borrower, Collector, and AR — without breaking metadata-only proofs or Confirm/Reject/DCR/post.

**Architecture:** Reuse existing `payments.storage_path` / `file_name` and POST hooks. Client uploads to `loan-documents` under `{borrowerId}/payments/...`, then POST metadata. Add storage SELECT for collectors, payment download APIs, and View links. Leave DCR `deposit_proof_path` alone.

**Tech Stack:** Next.js App Router, Supabase Storage + RLS, existing `createSignedDownloadUrl`, `DOCUMENT_BUCKET`, `LoanActivePanel`, collector proofs, AR masterlist.

**Spec:** `docs/superpowers/specs/2026-07-23-payment-proof-file-attach-design.md`

---

## File map

| File | Role |
|------|------|
| `supabase/migrations/20260723210000_payment_proof_storage.sql` | HEIC/HEIF mime + collector storage SELECT |
| `src/lib/payments/proof-storage.ts` | Path builder + allowed mime set + path ownership check |
| `src/lib/payments/__tests__/proof-storage.test.mts` | Unit tests for path/mime helpers |
| `src/app/api/borrower/applications/[id]/loan/route.ts` | Validate optional path/mime on POST |
| `src/app/api/borrower/payments/[id]/download/route.ts` | Borrower signed download |
| `src/app/api/collector/payments/[id]/download/route.ts` | Collector signed download |
| `src/app/api/ar/payments/[id]/download/route.ts` | AR signed download |
| `src/lib/payments/download.ts` | Shared “load payment + sign URL” helper |
| `src/components/borrower/LoanActivePanel.tsx` | Optional file + View in history |
| `src/app/api/collector/payments/route.ts` | Add `storage_path`, `file_name` to select |
| `src/app/collector/proofs/page.tsx` | View link |
| `src/app/ar/masterlist/[id]/page.tsx` | View link |

**Do not touch:** DCR post body, Confirm/Reject PATCH semantics, `deposit_proof_path`, documents checklist routes.

---

## Phase 0 — Safety baseline (no product change)

### Task 0: Confirm current metadata-only path still green

**Files:** none (verify only)

- [ ] **Step 1:** Note current behavior for regression later:
  - Borrower submit without file → `pending_verification`
  - Collector Confirm/Reject works
  - AR masterlist lists payments by amount/ref

- [ ] **Step 2:** Run existing related tests if present:

```bash
cd loanstar
npx tsx --test "src/lib/collector/__tests__/**/*.mts" 2>nul; npx tsx --test "src/lib/ar/__tests__/**/*.mts" 2>nul
```

Expected: pass or no matching files (do not invent failures).

**Exit criteria:** Documented baseline; no code changes in this phase.

**Status (2026-07-23):** Done — collector/AR unit tests green; metadata-only API confirmed.

---

## Phase 1 — Storage foundation (RLS + MIME) — no UI yet

### Task 1: Migration — HEIC/HEIF + collector storage SELECT

**Files:**
- Create: `supabase/migrations/20260723210000_payment_proof_storage.sql`

- [ ] **Step 1:** Write migration:

```sql
-- Allow phone-camera HEIC/HEIF for payment receipts (product decision C).
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif'
]::text[]
WHERE id = 'loan-documents';

-- Collectors need SELECT to createSignedUrl for payment proofs.
CREATE POLICY storage_collector_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'loan-documents'
    AND public.has_module_permission('collection', 'view')
  );
```

- [ ] **Step 2:** Apply via project convention (Supabase MCP `apply_migration` or documented local path). Do **not** use destructive resets.

- [ ] **Step 3:** Verify in SQL: bucket mime array includes `image/heic`; policy `storage_collector_select` exists.

**Exit criteria:** Collectors can SELECT from `loan-documents`; HEIC allowed by bucket. No app UI change yet.

---

## Phase 2 — Shared payment proof helpers + POST hardening

### Task 2: Path / mime helpers + tests

**Files:**
- Create: `src/lib/payments/proof-storage.ts`
- Create: `src/lib/payments/__tests__/proof-storage.test.mts`

- [ ] **Step 1:** Write failing tests:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPaymentProofStoragePath,
  isAllowedPaymentProofMime,
  assertPaymentProofPathOwnedByBorrower,
} from "../proof-storage";

test("buildPaymentProofStoragePath prefixes borrower id", () => {
  const path = buildPaymentProofStoragePath(
    "borr-1",
    "tmp-123",
    "receipt/../x.pdf",
  );
  assert.equal(path.startsWith("borr-1/payments/tmp-123/"), true);
  assert.equal(path.includes(".."), false);
});

test("isAllowedPaymentProofMime accepts pdf jpeg png webp heic", () => {
  assert.equal(isAllowedPaymentProofMime("application/pdf"), true);
  assert.equal(isAllowedPaymentProofMime("image/heic"), true);
  assert.equal(isAllowedPaymentProofMime("application/zip"), false);
});

test("assertPaymentProofPathOwnedByBorrower rejects foreign prefix", () => {
  assert.throws(() =>
    assertPaymentProofPathOwnedByBorrower("other/payments/a/b.pdf", "borr-1"),
  );
  assert.doesNotThrow(() =>
    assertPaymentProofPathOwnedByBorrower(
      "borr-1/payments/tmp/receipt.pdf",
      "borr-1",
    ),
  );
});
```

- [ ] **Step 2:** Run tests — expect FAIL (module missing).

```bash
cd loanstar
npx tsx --test src/lib/payments/__tests__/proof-storage.test.mts
```

- [ ] **Step 3:** Implement `proof-storage.ts`:

```ts
const ALLOWED = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function buildPaymentProofStoragePath(
  borrowerId: string,
  tempKey: string,
  fileName: string,
): string {
  const safeName = fileName.replace(/[/\\]/g, "_");
  return `${borrowerId}/payments/${tempKey}/${safeName}`;
}

export function isAllowedPaymentProofMime(mime: string): boolean {
  return ALLOWED.has(mime.toLowerCase());
}

export function assertPaymentProofPathOwnedByBorrower(
  storagePath: string,
  borrowerId: string,
): void {
  const prefix = `${borrowerId}/payments/`;
  if (!storagePath.startsWith(prefix) || storagePath.includes("..")) {
    throw new Error("Invalid payment proof storage path");
  }
}
```

- [ ] **Step 4:** Re-run tests — expect PASS.

### Task 3: Harden borrower loan POST (optional file metadata)

**Files:**
- Modify: `src/app/api/borrower/applications/[id]/loan/route.ts`

- [ ] **Step 1:** Extend zod schema with optional `mimeType: z.string().optional()`. Keep `storagePath` / `fileName` optional.

- [ ] **Step 2:** After `getBorrowerMasterlist`, before insert — if either path or name present, require both; call `assertPaymentProofPathOwnedByBorrower`; if `mimeType` present, require `isAllowedPaymentProofMime`.

- [ ] **Step 3:** Verify POST **without** file fields still succeeds; POST with foreign `storagePath` → 400.

**Exit criteria:** Helpers tested; POST rejects bad paths; no-file submit unchanged.

---

## Phase 3 — Download APIs (no UI yet)

### Task 4: Shared download helper

**Files:**
- Create: `src/lib/payments/download.ts`

- [ ] **Step 1:** Implement `getPaymentProofSignedDownload(supabase, paymentId)` — select `storage_path`/`file_name` from `payments` (RLS applies), throw if no path, return `createSignedDownloadUrl` + fileName.

### Task 5: Three thin download routes

**Files:**
- Create: `src/app/api/borrower/payments/[id]/download/route.ts` — module `borrower_portal` view
- Create: `src/app/api/collector/payments/[id]/download/route.ts` — module `collection` view
- Create: `src/app/api/ar/payments/[id]/download/route.ts` — module `accounting_ar` view

Each: `requireModulePermission` → `getPaymentProofSignedDownload` → `jsonOk({ signedUrl, fileName })`.

**Exit criteria:** Download APIs exist; RLS/module gates in place. UI still metadata-only.

---

## Phase 4 — Borrower UI (optional attach + history View)

### Task 6: LoanActivePanel optional upload

**Files:**
- Modify: `src/components/borrower/LoanActivePanel.tsx`

- [ ] **Step 1:** Optional file state + dropzone/input; accept pdf/jpg/png/webp/heic; hint “Optional — up to 10MB”.

- [ ] **Step 2:** On submit with file: upload to `DOCUMENT_BUCKET` via `buildPaymentProofStoragePath(borrowerId, Date.now(), file.name)` then POST with `storagePath`/`fileName`/`mimeType`. Without file: existing body only.

- [ ] **Step 3:** Ensure `borrowerId` is available (prop or loan payload). Folder must be `borrowers.id`, not `auth.uid()`.

- [ ] **Step 4:** History: if `storage_path`, **View** → GET `/api/borrower/payments/${id}/download` → open `signedUrl`.

- [ ] **Step 5:** Manual: no-file submit works; with-file View works.

**Exit criteria:** Optional attach works; metadata-only still works; borrower can View own file.

---

## Phase 5 — Collector View (Confirm/Reject untouched)

### Task 7: Collector payments API file fields

**Files:**
- Modify: `src/app/api/collector/payments/route.ts` — add `storage_path`, `file_name` to `PAYMENT_SELECT`.

### Task 8: Proofs page View link

**Files:**
- Modify: `src/app/collector/proofs/page.tsx` — type + **View** when `storage_path`; Confirm/Reject handlers unchanged.

**Exit criteria:** View only when file exists; review flow unchanged.

---

## Phase 6 — AR View

### Task 9: Masterlist payment timeline View

**Files:**
- Modify: `src/app/ar/masterlist/[id]/page.tsx` — extend type; **View** → `/api/ar/payments/${id}/download`. GET already returns `*`.

**Exit criteria:** AR can View receipts; no DCR/`deposit_proof_path` changes.

---

## Phase 7 — Regression + closeout

### Task 10: End-to-end checklist

- [ ] No-file happy path: submit → confirm → DCR → AR post.
- [ ] With-file: Borrower/Collector/AR View.
- [ ] Unassigned collector cannot download.
- [ ] `npx tsx --test src/lib/payments/__tests__/proof-storage.test.mts` passes.

**Exit criteria:** Spec success criteria met; metadata-only flow unregressed.

---

## Why this order

1. Baseline → 2. Storage RLS/mime (else collector View fails) → 3. Path validation → 4. Download APIs → 5. Borrower UI → 6–7. Staff View → 8. Full regression.

Each phase leaves prior behavior intact; stopping after Phase 2 or 3 does not break production UI.

---

## Spec coverage

| Spec item | Phase |
|-----------|-------|
| Optional attach | 4 |
| Borrower/Collector/AR View | 4–6 |
| Images+PDF+HEIC | 1 + 4 |
| Metadata-only unbroken | 0, 2, 4, 7 |
| No DCR deposit_proof change | Out of scope |
| Path ownership | 2 |
| Collector storage SELECT | 1 |
