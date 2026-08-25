# First Payment Date — Timezone Off-By-One-Day Fix

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax. The user runs **one phase at a time** and reviews before the next starts.

**Goal:** `computations.first_payment_date` (and `masterlist.first_payment_date`, copied from it) is saved one calendar day earlier than the date `computeFirstPaymentDate` actually calculates, because of a timezone-sensitive string conversion. The real amortization schedule and the BLRI document are unaffected — confirmed in code, not assumed — but the stored reference date, and everything reading it (including today's PDC-lock feature), inherits the error.

---

## Audit — confirmed root cause, confirmed blast radius

1. **`computeFirstPaymentDate` (`src/lib/computation/release-date.ts`) builds the date correctly.** Its return statement is `new Date(targetYear, normalizedMonth, paymentDay)` — the *numeric* `Date` constructor, which always sets **local midnight** (00:00 in whatever timezone the code runs in).
2. **The bug is entirely in one line downstream**: `src/lib/csa/computation.ts:281` — `first_payment_date: firstPayment.toISOString().slice(0, 10)`. `.toISOString()` converts to UTC first. In the Philippines (UTC+8, ahead of UTC), local midnight converts to *the previous day*, 16:00 UTC — so slicing the date part gives the wrong, earlier day. Confirmed by direct execution in this environment (Node running under `Asia/Manila`, UTC+8): `computeFirstPaymentDate(new Date("2026-08-23"), 2, 10)` internally computes **November 10** correctly, but `.toISOString().slice(0,10)` on that same value yields **`2026-11-09`**.
3. **The sibling line on the same insert, `release_date: releaseDate.toISOString().slice(0, 10)` (`:280`), is *not* affected.** `releaseDate` is built via `new Date(stringInput)` or bare `new Date()` — never the numeric local-midnight constructor — so it doesn't fall into the same trap. Confirmed by tracing the construction path, not assumed.
4. **`addScheduleMonths` (added earlier today, `release-date.ts`) is also *not* affected**, despite also ending in `.toISOString().slice(0,10)` — confirmed by direct execution: its anchor is parsed *from a string* (`new Date("2026-11-10")`), which lands on 8am local time (Philippines is ahead of UTC, so UTC-midnight-as-local-time never crosses a day boundary backward). Advancing that by 0/1/2 months and converting back to UTC stayed exactly on the 10th every time in a live test. Only the *numeric* `new Date(y, m, d)` construction pattern is dangerous when paired with `.toISOString()` — not the string-parse pattern.
5. **Two existing call sites already avoid this correctly, by coincidence of a different (correct) technique**, not because anyone knew about this specific trap: `src/lib/ar/schedule.ts`'s local `formatDateLocal` and `src/lib/lra/blri-data.ts`'s local `formatDate` both read `getFullYear()`/`getMonth()`/`getDate()` directly off the `Date` object, never touching `.toISOString()`. This is why:
   - **The real amortization schedule (`amortization_schedules.due_date`) is correct** — verified in code, this is what actually drives AR collections, penalties, and aging.
   - **The BLRI document's printed "PAYMENT STARTS" date is correct** — verified in code, this is what the borrower actually signs.
6. **What's actually wrong, confirmed by tracing every consumer**:
   - `computations.first_payment_date` — the root, wrong by exactly one day.
   - `masterlist.first_payment_date` — copied verbatim from the above at account creation (`src/lib/ar/masterlist.ts:142`), so also wrong.
   - Everything reading either of those *stored* values downstream: today's LRA PDC-lock feature (this is why the screenshot showed 11/09 instead of 11/10), `collector/queue.ts`'s date-range filter, `masterlist.ts`'s CSV/Excel export (`masterlistToExportRow`), and the borrower-facing computation API response (`src/app/api/borrower/applications/[id]/computation/route.ts:78` — returned, but confirmed nothing in the borrower portal UI currently renders it).
   - Nothing in CSA, Committee, or AR's own pages currently displays this field directly (confirmed via search) — the live, user-visible exposure today is specifically the LRA PDC screen.
7. **Scale — confirmed genuinely inconsistent, not uniform.** 126 `computations` rows and 43 `masterlist` rows have a non-null `first_payment_date`. Directly checked a sample against their own stored inputs: two rows with **identical** `release_date`/`addon_months`/`due_day`, created 11 minutes apart, produced **different** `first_payment_date` values (one matching what the inputs should produce, one a day early). This rules out "always wrong by exactly one day" — the discrepancy correlates with *which server process handled that particular request*, not with the code path taken. **This strongly suggests the bug depends on that process's system timezone at the time**, not something inherent to every computation ever made. Whether this has ever manifested in a real deployed environment (as opposed to only during local development on this Philippines-timezone machine) is unconfirmed — worth asking before Phase 3 proceeds. Phase 1's fix removes the timezone-dependency entirely regardless of the answer, which is worth doing either way. Phase 3 must check each existing row against its own stored inputs individually — no blanket "+1 day to everything" correction.

---

## Architecture

- **The fix is one line.** `src/lib/csa/computation.ts:281` switches from `.toISOString().slice(0, 10)` to a local-safe formatter — same technique `ar/schedule.ts` and `blri-data.ts` already use correctly, added once as a shared, exported function in `release-date.ts` (the established home for this module's date utilities) rather than duplicated a third time.
- **`ar/schedule.ts` and `blri-data.ts` are not touched.** They're already correct; forcing them onto the new shared helper would be a pure refactor with no bug-fix value and unnecessary risk to two files that matter a great deal (the real schedule, the signed document).
- **`addScheduleMonths` is not touched.** Confirmed not affected (audit point 4) — "fixing" something that isn't broken is not in scope.
- **Existing bad data is a separate decision** (Phase 3), gated on re-auditing which rows are actually wrong and getting explicit confirmation before any write — same discipline as every data-touching phase this session.

---

## Ground Rules

- **Closed Allow lists per phase.** Anything outside → STOP and flag.
- `git diff --stat` after each phase.
- **Do not commit** unless asked.
- **Phase 3 (existing-data correction) requires explicit user confirmation before any write** — same as every prior data-touching phase.

---

## Hard Constraints

### Never Modify
- `computeFirstPaymentDate` itself — already computes the correct value; the bug is entirely in how a *caller* converts it to text.
- `ar/schedule.ts`'s `formatDateLocal` and `blri-data.ts`'s `formatDate` — both already correct, out of scope.
- `addScheduleMonths` — confirmed not affected by this bug; do not touch under this plan.
- `release_date`'s own `.toISOString()` call in `computation.ts:280` — confirmed safe (audit point 3); do not "fix" something that isn't broken.

### Touch With Extreme Care
- Phase 3's data correction (if the user approves one) — must only touch rows individually confirmed wrong by recomputing from that row's own stored inputs, never a blanket "+1 day to every non-null date" update. Audit point 7 confirmed the discrepancy isn't uniform even across identical inputs, so a blanket shift would introduce new errors into rows that are already correct.

---

## Locked Product Decisions

| # | Decision |
|---|---|
| 1 | **Fix the write path, not the read paths.** The two call sites that already read `computeFirstPaymentDate`'s result correctly stay untouched; only the one call site that converts it wrong is fixed. |
| 2 | **Existing data is not touched without a separate, explicit decision.** Shipping the code fix stops new wrong dates from being created; whether to correct the 126/43 existing rows is a distinct question asked after Phase 1 ships. |

---

## Phase 1: Fix the Conversion

### Scope
Add a shared local-safe date formatter; use it at the one buggy call site.

### Allow List
- `src/lib/computation/release-date.ts` (adding one new exported function)
- `src/lib/csa/computation.ts`

### Tasks
- [x] Added `formatDateLocal(d: Date): string` to `release-date.ts`, matching `ar/schedule.ts`'s existing implementation exactly.
- [x] Changed `computation.ts`'s `first_payment_date` write from `firstPayment.toISOString().slice(0, 10)` to `formatDateLocal(firstPayment)`. `release_date` on the adjacent line left untouched, per the Hard Constraint (confirmed safe).

### Verification
- [x] `npx tsc --noEmit` — 13 errors, baseline unchanged.
- [x] `npm run test` — 1349 passed, 0 failures.
- [x] Lint — clean on both files.
- [x] Live check via the real exported functions: `formatDateLocal(computeFirstPaymentDate(new Date("2026-08-23"), 2, 10))` → `"2026-11-10"`, confirmed no longer `"2026-11-09"`.
- [x] `git diff --stat` — only the two Allow-listed files.

---

## Phase 2: Confirm the Fix Live

### Scope
Prove a freshly-created computation now stores the correct date, and that it flows through to the PDC screen correctly.

### Allow List
- None — verification only, using the same throwaway-test-data method as prior plans.

### Tasks
- [x] Built a fresh computation via the real `persistComputation` (release date 2026-08-23, addon 2, due day 10 — the exact audit reproduction case) using the real service-role client against the live database. Saved `computation.firstPaymentDate` = `"2026-11-10"`, matching hand-calculated truth exactly (not `2026-11-09`).
- [x] Read the same record back via `getActiveComputation` — the same function the LRA API route uses — confirmed identical (`"2026-11-10"`).

### Verification
- [x] Test data cleaned up after (0 leftover rows). Note: the Supabase MCP tool itself had a transient outage during this phase (503s on `execute_sql`) — confirmed the underlying database was unaffected via a direct connectivity check, and completed this phase's verification using direct scripts instead.

---

## Phase 3: Existing Data — **needs explicit confirmation**

### Scope
Decide what to do with the 126 `computations` / 43 `masterlist` rows already carrying the wrong date.

### Tasks
- [x] Recomputed every `computations` row (non-null `first_payment_date`/`release_date`/`due_day`, 125 of 126 qualified — one had a null `due_day`) from its own stored inputs using the fixed logic, compared against what's stored. **Result: 12 already correct, 113 confirmed off by exactly one day early, 0 unexplained.**
- [x] Same recompute-and-compare for `masterlist.first_payment_date`, joined via `computation_id` back to its source computation's inputs (43 rows). **Result: 4 already correct, 39 confirmed off by exactly one day early, 0 unexplained.** (This also resolves the audit's earlier open question about a possible separate import-path origin — every masterlist row does join to a real computation with matching inputs; no separate origin exists.)
- [x] **Asked the user explicitly.** Decision: **(a) leave history as-is** — only new computations get the correct date going forward; the 113 + 39 existing rows keep their current (one-day-early) values. No data write performed in this phase.

### Verification
- [x] N/A — no correction was made, per the user's decision. Nothing to spot-check.

---

## Phase 4: Regression Sweep

### Tasks
- [x] `npx tsc --noEmit` — 13 errors, matches baseline exactly.
- [x] `npm run test` — 1349 passed, 0 failures.
- [x] `git diff --stat` — only `release-date.ts` and `csa/computation.ts` touched across the whole plan, nothing else.
