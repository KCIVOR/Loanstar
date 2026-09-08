# Task 4 — Warn / block duplicate daily collection reports

**Source:** [../../../docs/Development-Tracker-Sept-04.md](../../../docs/Development-Tracker-Sept-04.md) → Task 4
**Type:** fix to already-built behaviour (Collector → DCR → Accounting posting flow)
**Workflow:** Claude audits + plans → Cursor implements → summary validated. Do
not implement directly unless told otherwise.

---

## Part A — Audit (read in the code this pass)

### A.1 The flow, end to end

1. **Record a payment** — `POST /api/collector/payments`
   (`src/app/api/collector/payments/route.ts`). Form is
   `RecordPaymentForm.tsx`: amount, payment date, reference no, channel,
   remarks, optional proof. **No installment / month field.** The route inserts
   one `payments` row with `status = 'confirmed'` immediately. **No duplicate
   check of any kind.**
2. **Build a DCR** — `createDcrDraft` inserts a `dcr` row `status = 'draft'`
   (`src/lib/ar/posting.ts:1410`). **No check for an existing open DCR.** A
   collector may hold many drafts.
3. **Add a payment to the DCR** — `addPaymentToDcr` (`posting.ts:1507`). Links
   the `payments` row to the DCR via `dcr_items`, and writes
   `dcr_item_allocations` rows (one per installment the money covers — auto
   `computeAutoAllocation`, or manual). **This is the only place a duplicate
   guard exists** (A.3).
4. **Submit** — `submitDcr` (`posting.ts:1356`): `dcr.status` `draft → submitted`,
   payments' verification rows flip to `confirmed`. **No duplicate check.**
5. **Accounting posts** — AR reconciles each `dcr_item`
   (`reconcileDcrItem` / `post_single_dcr_item` RPC). Only now does
   `recomputeOutstandingBalance` (`posting.ts:152`) move
   `masterlist.outstanding_balance` and set installment `status`/`amount_paid`.

### A.2 The gap

- **At record time — nothing.** A collector can record 2, 3, N payments on the
  same account back to back. Nothing says "you already have ₱X recorded here
  that Accounting hasn't posted."
- **At DCR add / submit — only a same-`payment_id` guard** (A.3). Two
  *different* `payments` rows that both target the same installment, on two
  different unposted DCRs, are not blocked.
- **No on-screen indicator** anywhere (collector accounts list, account detail,
  record-payment page, DCR builder) that a payment / DCR for this borrower is
  pending and not yet posted.
- **The balance the collector sees is post-only.** `masterlist.outstanding_balance`
  and installment `amount_paid` only change when Accounting posts
  (`recomputeOutstandingBalance`). While a DCR is unposted the account still
  shows the full amount owed — so a collector who doesn't remember the earlier
  payment records it again. The record-payment page even says *"Only posted
  credits affect the ledger balance"* — accurate, but it's exactly what invites
  the duplicate.

### A.3 Why the existing safeguard did not stop the demo duplicate

`addPaymentToDcr` (`posting.ts:1534-1548`):

```ts
const { data: existingItems } = await supabase
  .from("dcr_items")
  .select("id, dcr!inner ( id, status )")
  .eq("payment_id", paymentId);              // ← keyed ONLY on payment_id
const alreadyBatched = (existingItems ?? []).some((row) =>
  isActiveDcrStatus(row.dcr.status));        // draft | submitted | reconciled
if (alreadyBatched) throw new Error("Payment is already on a DCRR");
```

It only prevents **the same `payments` row** from being on two active DCRs. In
the demo Rovick *recorded new payments* for the leftover ₱9k and batched those —
new `payment_id`s, so `alreadyBatched` is false every time. The guard was never
designed to catch "different payment, same borrower/installment." That is the
"why it got through."

### A.4 Data model — what "same borrower / period" resolves to

| Table | Relevant columns | Note |
| :- | :- | :- |
| `payments` | `id`, `masterlist_id`, `amount`, `status` (`pending_verification`/`confirmed`/`posted`/`rejected`), `payment_date` | **No installment/period column.** A recorded-but-unbatched payment has no "period" yet. |
| `dcr` | `id`, `collector_user_id`, `status` (`draft`/`submitted`/`reconciled`/`rejected`) | **No `masterlist_id`/`borrower_id`** — a DCR spans accounts. |
| `dcr_items` | `id`, `dcr_id`, `payment_id`, `status` (`pending`/`posted`/`rejected`) | one payment ↔ one DCR |
| `dcr_item_allocations` | `dcr_item_id`, `amortization_schedule_id`, `amount` | **this is the only "period" link** — money → specific installment row |

So:
- **"Same account, unposted"** (loose, available at record time) =
  `payments` on this `masterlist_id` with `status IN ('pending_verification','confirmed')`
  that are **not** on a posted item.
- **"Same installment, unposted"** (precise, only available once allocations
  exist) = a `dcr_item_allocations.amortization_schedule_id` that also appears on
  another `dcr_item` with `status='pending'` on a `dcr` with
  `status IN ('draft','submitted')`.

"Not yet posted" = the `dcr_item` is still `pending` on a `draft` or `submitted`
DCR. (`reconciled` means AR already processed it; `rejected` frees the payment.)

### A.5 What already exists to build on

- `paymentIdsLockedForCollectorDesk` / `isActiveDcrStatus`
  (`src/lib/collector/desk.ts`) — DCR-status helpers, pure, testable.
- `GET /api/collector/accounts/[id]` already returns **every** `payments` row
  for the account (all statuses) — the data for an indicator is already on the
  wire; nothing new to fetch there.
- `GET /api/collector/payments` already joins `dcr_items → dcr.status` to
  compute `locked` / `draftPaymentIds` — the same join extended by
  `masterlist_id` gives "unposted on this account".
- `fetchOpenInstallments` / `computeAutoAllocation` (`posting.ts`) — the
  allocation source of truth to reuse for the same-installment check.

### A.6 RLS / permissions notes

- Collector reads `payments` / `dcr` / `dcr_items` under its own RLS session in
  the routes above without a service client, so a new **read** for the check
  needs no workaround — but confirm the policy on `dcr_item_allocations`
  (used only server-side today) allows the collector's session to SELECT it for
  *their own* DCR items; if not, the same-installment check runs via
  `createServiceClient()` (matches the pattern already used for
  `listMoveOfPaymentCandidates` in the account route). Assume nothing — check
  `pg_policies` for `dcr_item_allocations` before writing the query.
- This is the recurring "silent RLS-blocked read returns zero rows → guard
  never fires" pattern from prior flows — the check MUST fail loud (or use
  service role) rather than silently see no duplicates.

---

## Part B — What to deliver (from the tracker)

1. A **clear on-screen warning** to the collector when a payment / DCR for that
   borrower and period is already submitted and not yet posted.
2. A **block** that stops a duplicate DCR being created for the same
   borrower/period while an earlier one is unposted.
3. **Re-check the existing safeguard** and explain the miss (done — A.3).

### Open questions for the client (do not assume)

- **Scope of the block:** same **installment/period** only (recommended — Rovick
  said several DCRs across *different* months are fine), or wider ("any unposted
  payment on this account")?
- **Hard block vs override:** at record time and at DCR submit — fully blocked
  until Accounting posts, or a warning the collector can override with a typed
  reason (logged)?
- Should **Remedial** (same routes, `remedial` permission) get the identical
  treatment? (Assume yes unless told otherwise.)

This plan builds the **indicator + warning unconditionally** (safe, no rule
needed), and implements the **block at the installment level with an
override switch** so the two answers above are a config change, not a rewrite.

---

## Part C — Phased plan

### Guiding constraint

The posting pipeline (`post_single_dcr_item` RPC, `reconcileDcrItem`,
`recomputeOutstandingBalance`, balance/aging math) is **not touched**. This task
only adds *read-only detection* + UI surfacing + one guarded throw. No change to
how a payment or a posting mutates any balance.

---

### Phase 1 — Pure detection helpers (no wiring)

**File:** new `src/lib/ar/duplicate-dcr.ts` (+ `__tests__/duplicate-dcr.test.mts`).

- `summarizeUnpostedForAccount(rows): { count, totalAmount, referenceNos[] }` —
  given `payments` rows for one `masterlist_id`, return the unposted set
  (`status IN ('pending_verification','confirmed')` and not on a posted item).
  Pure; takes already-fetched rows.
- `findInstallmentConflicts(candidateAllocations, otherActiveAllocations):
  number[]` — given the installment ids a new DCR item would cover and the
  installment ids already covered by other `pending` items on `draft`/`submitted`
  DCRs, return the overlapping `amortization_schedule_id`s / installment nos.
  Pure.
- Reuse `isActiveDcrStatus`; add `isUnpostedDcrStatus(s) = draft | submitted`
  (narrower — `reconciled` is already processed).

**Done when:** helpers have unit tests covering: no unposted, one unposted,
partial-vs-full, same-installment overlap, different-installment (no conflict),
rejected DCR = not a conflict, posted item = not a conflict.

---

### Phase 2 — Record-payment warning (informational)

**Files:** `src/app/api/collector/payments/route.ts`,
`RecordPaymentForm.tsx` / `RecordPaymentPage.tsx`.

- **GET side:** the account payments the page already loads → compute
  `summarizeUnpostedForAccount` and include an
  `unpostedOnAccount: { count, totalAmount }` field in the response (route
  `GET /api/collector/accounts/[id]` already returns the rows — just summarize).
- **UI:** when `unpostedOnAccount.count > 0`, show a persistent notice above the
  record-payment form:
  *"⚠ This account has N payment(s) totalling ₱X already recorded and waiting
  for Accounting to post. Recording another may double-count — check the
  pending list first."* with a link/expander to the pending payments.
- **POST side:** on record, if the account has unposted payments, still allow it
  (this is a warning, not a block — a genuinely separate payment is valid), but
  return `warning: "..."` in the success payload so the UI can echo a toast, and
  write it into the audit event (`afterData.recordedWithUnpostedPending: N`).

**Done when:** recording a 2nd payment on an account with an unposted one shows
the warning before and after submit; the first payment on a clean account shows
nothing.

---

### Phase 3 — Same-installment block at DCR add / submit

**File:** `src/lib/ar/posting.ts` (`addPaymentToDcr`, and a check in
`submitDcr`), reusing Phase 1 helpers.

- In `addPaymentToDcr`, after `resolvedAllocations` is computed, look up all
  `dcr_item_allocations.amortization_schedule_id` for **other** `dcr_items` with
  `status='pending'` on DCRs with `status IN ('draft','submitted')` for the same
  `masterlist_id` (via the payment's account). Run `findInstallmentConflicts`.
- If there is an overlap:
  - **Block by default:** throw
    `"Installment #N for <borrower> is already on an unposted DCR (<ref>). Post
    or reject that first, or remove the overlapping allocation."`
  - **Override switch:** gate the throw behind a check —
    `validateFieldEdit("collection", "dcr_duplicate_override", user.id)` (a new
    field-rule permission) OR a passed `acknowledgeDuplicate: true` from a
    collector who has that permission. Default: nobody has it → hard block.
    The client's "override vs hard" answer = grant/deny that permission, no code
    change.
- Add the same check to `submitDcr` as a backstop (a draft built before another
  DCR claimed the installment).
- Keep the existing `alreadyBatched` (same-`payment_id`) guard — it's still
  correct for its own case.
- Extend the `add_item` route schema with the optional
  `acknowledgeDuplicate: z.boolean().optional()` and pass it through.

**Done when:** two different payments targeting installment #3 of the same
account, on two draft DCRs, cannot both be added/submitted — the second is
blocked with the message; a collector with the override permission can proceed
and it is audit-logged; two payments on *different* installments are unaffected.

---

### Phase 4 — Visible "pending / unposted" indicator on the account

**Files:** `src/lib/collector/queue.ts` (or the accounts-list API),
`src/app/collector/accounts/page.tsx`, account detail page, DCR builder.

- Accounts list: a badge on any account row that has ≥1 unposted payment —
  *"DCR pending"* / *"N unposted"*. One extra grouped query
  (`payments` by `masterlist_id` where status in the unposted set, minus
  posted-item payment_ids) — not N+1.
- Account detail (`/collector/accounts/[id]`): a summary line + the list of
  unposted payments with their reference nos and which DCR (if any) they're on.
- DCR builder: when a payment is added whose account already has another
  unposted payment, show an inline caution on that row.

**Done when:** a collector can see, without opening each account, which ones
have money in flight to Accounting.

---

### Phase 5 — Remedial parity + tests + regression

- Apply Phases 2–4 to the Remedial equivalents (same routes gate on
  `remedial` permission; same `RecordPaymentPage` with `desk="remedial"`).
- Unit tests: Phase 1 helpers (done there) + a posting test that
  `addPaymentToDcr` throws on a same-installment conflict and passes on a
  distinct one (follow `src/lib/ar/__tests__/` patterns — check whether these
  use a stub client like `release-service.test.mts` or hit helpers directly).
- `npm test` green; `npx tsc --noEmit`; `npm run build`; `eslint` on touched
  files.

---

### Phase 6 — Client review (Wednesday)

Demo: record a payment, start a DCR, try to record/batch a second payment for
the same installment → show the warning, then the block. Confirm:
- the block scope (same installment vs wider),
- hard block vs override-with-reason,
- Remedial gets the same,
- the wording of the messages.

Do not mark the tracker item Done until confirmed.

---

## Part D — Constraints

### D.1 Files that MAY change

| File | Phase |
| :- | :- |
| `src/lib/ar/duplicate-dcr.ts` (new) + its `.mts` test | 1, 5 |
| `src/app/api/collector/payments/route.ts` | 2 |
| `src/components/payments/RecordPaymentForm.tsx` / `RecordPaymentPage.tsx` | 2, 4 |
| `src/app/api/collector/accounts/[id]/route.ts` (summary field only) | 2, 4 |
| `src/lib/ar/posting.ts` (`addPaymentToDcr`, `submitDcr` — add a guarded read + throw) | 3 |
| `src/app/api/collector/dcr/route.ts` (`add_item` schema: `acknowledgeDuplicate`) | 3 |
| `src/lib/collector/queue.ts` + `src/app/collector/accounts/page.tsx` + account detail + DCR builder UI | 4 |
| Remedial equivalents (`src/app/remedial/...`, `src/app/api/remedial/...` if separate) | 5 |
| a new field-rule permission `collection:dcr_duplicate_override` (config/seed, not code) | 3 |

### D.2 MUST NOT change

- `post_single_dcr_item` RPC and its migrations; `reconcileDcrItem`,
  `reconcileAndPostDcr`, `rejectDcr`, `settleDcrStatusIfComplete`.
- `recomputeOutstandingBalance`, aging refresh, penalty math, rounding write-off.
- The existing `alreadyBatched` (same-`payment_id`) guard — keep as-is.
- Payment / DCR **status vocabularies** and lifecycle transitions.
- How allocations are computed (`computeAutoAllocation`, `fetchOpenInstallments`)
  — reuse, don't alter.

### D.3 Data / tooling

- **No schema migration required** — the check is a SELECT over existing tables.
  *Optional* performance indexes (only if a query plan shows a seq scan):
  `dcr_item_allocations (amortization_schedule_id)`,
  `payments (masterlist_id, status)`. If added, follow the **two-folder**
  migration convention (`loanstar/supabase/migrations` + `supabase/migrations`)
  and apply via the Supabase MCP (per the p8 note in
  [[project_document_template_system]]) — but default is **no migration**.
- The new `collection:dcr_duplicate_override` permission is a **field-rule /
  role-permission seed row**, added the same way other `collection` field rules
  were — not a migration to app tables.
- **Do not** use the Supabase MCP to mutate data during implementation; reads
  for the `pg_policies` check (A.6) are fine.
- **No backfill** — the check is forward-looking; existing unposted DCRs simply
  start being counted.

### D.4 Behavioural guardrails

- Every new lookup must **fail loud or use service role** — a silent
  RLS-blocked read that returns zero rows would make the guard a no-op (A.6).
- The record-payment path stays **non-blocking** (warning only) unless the
  client explicitly asks for a hard block there — a collector recording a
  legitimately separate payment must not be stuck.
- The DCR-add/submit block is the **enforcement** point; keep it a single
  guarded throw, overridable by the one new permission.
- Messages name the borrower, the installment, and the conflicting DCR
  reference so the collector can act on them.

---

## Part E — Open questions for the client (repeat of B, for the meeting)

1. Block scope: **same installment/period only** (recommended) vs any unposted
   payment on the account.
2. **Hard block** until Accounting posts, vs **warning + override with a logged
   reason** (recommended for record-time; hard for DCR submit).
3. Does **Remedial** get the identical behaviour? (assumed yes)
4. Exact wording of the warning and block messages.

---

## Part F — Progress log

- 2026-09-07 — Audit + phased plan written (Claude). Not implemented. Root cause
  of the demo miss identified: `addPaymentToDcr`'s `alreadyBatched` guard is
  keyed on `payment_id` only and never covered "different payment, same
  installment". Awaiting the client answers in Part E before Phase 3's block
  scope is finalised; Phases 1–2 and 4 (helpers, warning, indicator) can start
  now.
