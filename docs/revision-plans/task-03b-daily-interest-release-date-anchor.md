> **SUPERSEDED 2026-09-07** by [task-03-daily-interest-FINAL-plan.md](task-03-daily-interest-FINAL-plan.md), written from the verified `Calculator SME.xlsm` formulas. Kept for history only.

# Task 3b — Anchor daily interest to a real release date, not the compute date

**Parent:** Task 3 (daily interest ÷ real days in month) — see
[task-03-daily-interest-actual-days-in-month.md](task-03-daily-interest-actual-days-in-month.md).
That task fixed the *divisor*. This one fixes *which window the days are counted
over*, which the divisor fix exposed but did not cause.

**Workflow:** Claude audits + plans → Cursor implements → summary validated. Do
not implement directly unless told otherwise.

**Status of this doc:** audit complete, plan below is **Model 1** (fix the
inputs, keep the figure frozen at signing). Model 2 (finalise interest at
release) is described in Part B and needs an explicit client decision before it
could be planned.

---

## Part A — Audit (every claim below was read in the code this pass)

### A.1 The defect, precisely

`computeDailyInterestLoan` (`src/lib/computation/daily.ts`) accrues interest over
the calendar span `releaseDate → paymentDate`. Its caller
`persistComputation` (`src/lib/csa/computation.ts:470`) sets:

```ts
const releaseDate = input.releaseDate ? new Date(input.releaseDate) : new Date();
```

and passes it into the daily engine at `src/lib/csa/computation.ts:569-574`
(`releaseDate` there → daily `input.releaseDate`; `firstPayment` →
`input.paymentDate`, where `firstPayment = new Date(input.manualPaymentDate!)`
for daily, line 509).

**In every production path `input.releaseDate` is never supplied**, so
`releaseDate` resolves to `new Date()` — the moment CSA (or Committee) clicks
Compute. The daily interest therefore covers *compute-date → payment-date*, not
*release-date → payment-date*.

Confirmed there is no other implementation: the only place a monthly rate
becomes a daily figure is `daily.ts` (grep of `src/` + both migration folders).

### A.2 Where `computations.release_date` / `input.releaseDate` comes from — all paths

| Path | Supplies a release date? | Result |
| :- | :- | :- |
| CSA calculator UI (`ComputationPanel.tsx`) | **No** — the POST body it builds (`src/components/csa/ComputationPanel.tsx:1387-1436`) has no `releaseDate` key. There is no release-date input field anywhere in the panel; lines 984 / 2615-2618 only *display* `computation.releaseDate`. | `body.releaseDate` = `undefined` |
| CSA compute route (`src/app/api/csa/applications/[id]/computation/route.ts`) | Schema has `releaseDate: z.string().optional()` (line 91) and forwards it (`releaseDate: body.releaseDate`, line 446) — **but nothing validates or populates it**, and the UI never sends it. | forwards `undefined` |
| Committee override route (`.../committee/applications/[id]/override/route.ts`) | **No** `releaseDate` in the zod schema at all (it has `paymentDate: z.string().optional()`, line 58, but no release date). | never set |
| `negotiation/service.ts` → `persistOverrideComputation` (line 364) | Its `persistComputation({...})` call (lines 482-544) has **no `releaseDate` key**. `OverrideInput` (line 317) has no release-date field. | falls to `new Date()` |
| Borrower reloan route | Builds an application only; compute still runs later through the CSA route. | n/a |

Confirmed: the **only write** to `computations.release_date` after the initial
insert is `src/lib/lra/release-service.ts:1169-1172` (see A.4). Grep for
`release_date` + `update|insert|upsert` across `src/` returns exactly those two
sites (the insert at `csa/computation.ts:650`, the update at
`release-service.ts:1171`).

### A.3 What consumes the daily figure / `release_date` downstream

Once `persistComputation` stores `total_interest` / `total_loan` /
`monthly_amortization`, nothing recomputes daily interest:

| Consumer | Daily behaviour | Uses `release_date`? |
| :- | :- | :- |
| `src/lib/ar/masterlist.ts:256-268` (`initializeArAccount`) | Emits **one** row: `amountDue = computation.totalLoan`, `dueDate = computation.firstPaymentDate`. No recompute. | Reads `computation.releaseDate` at line 188 only to stamp `masterlist.release_date` (line 210); the daily schedule branch itself does not use it. |
| `src/lib/lra/release-service.ts:254-261` (`buildExpectedPdcSchedule`) | Returns `[{ amount: computation.totalLoan, date: firstPaymentDate }]`. No recompute. Daily **can** go With-PDC — no gate stops it. | No. |
| `src/lib/computation/discount-units.ts` | `maxDiscountUnits('daily') === 0`. | n/a |
| Reports (`src/lib/reports/metrics/money.ts:13`, `dashboard/aggregates.ts:269-336`) | `SUM(masterlist.total_loan) where release_date in period`. | Yes — see A.6 trade-off. |

### A.4 The LRA release sequence (read in full this pass)

1. **Doc-prep stage** (before release): `generateReleaseDocuments`,
   `savePdcChecks` (PDC amounts encoded from `computation.totalLoan`), witness
   signing. All read the frozen CSA figure.
2. **`recordRelease`** (`release-service.ts:1106-1194`): validates contract +
   briefing, inserts a `release_events` row, sets `release_files.status =
   'released'`, then at **lines 1169-1172**:
   ```ts
   await admin.from("computations")
     .update({ release_date: new Date().toISOString().slice(0, 10) })
     .eq("id", file.computationId);
   ```
   — overwrites the stored date with the actual release day. **It does not
   recompute `total_interest` / `total_loan`.** `recordRelease` does **not**
   call `initializeArAccount` or `savePdcChecks`.
3. **`closeRelease`** (`release-service.ts:1282-1420`): after PDC physically
   collected + signed scans uploaded — sets `status = 'closed'`, then calls
   `initializeArAccount` (line 1401), which builds the masterlist from
   `computation` as-is (for daily: the single frozen row).

Net for daily: by the time the AR account is created, `release_date` = the real
date, but `total_interest` still reflects the *compute-date → payment-date*
window. The stored date and the figure disagree.

### A.5 Signature & PDC constraints (why "just recompute at release" is not free)

- **The borrower signs the figure.** `src/app/api/borrower/applications/[id]/computation/route.ts:141-153`
  stores `signature_hash = sha256(JSON.stringify(computation))` — the hashed
  object includes `releaseDate`, `firstPaymentDate`, `totalLoan`,
  `totalInterest`. A second sign path exists in `negotiation/service.ts:712-723`.
- **The hash is never re-verified.** Grep: `signature_hash` / `signatureHash` is
  only ever *written* or *nulled*, never compared. So `recordRelease`'s
  overwrite already mutates a "signed" row silently for every schedule type —
  no code stops it, but it means the signed number is not currently sacred.
- **Committee override re-clears the signature** (`negotiation/service.ts:545-551`
  and `persistOverrideComputation` tail, lines 546-552: `signed_at/by/hash =
  null`, "borrower must re-sign"). Plain LRA release has **no** re-sign step.
- **Physical PDC cheques.** A daily loan on the With-PDC path has the borrower
  hand over one post-dated cheque for exactly `computation.totalLoan`.
  Recomputing interest after that point desynchronises the cheque from the
  ledger.

Conclusion: the architecture treats the signed figure as fixed. Recompute-at-
release (Model 2) is a real option but touches signing, PDC and re-ack — out of
scope for a "fix the anchor" change.

### A.6 Why non-daily schedules don't have this bug

Monthly / Salary / Weekly / Bi-Monthly / Quarterly / Two-Monthly all rebuild
their real schedule at `closeRelease` via `initializeArAccount` →
`generateAmortizationSchedule` / the frequency generators, using
`computation.releaseDate` **after** `recordRelease` has overwritten it with the
actual date (A.4 step 3 runs after step 2). Their interest total is a flat
`principal × rate × months` that doesn't depend on the day count. Daily is the
only type whose money figure is a function of an exact date span *and* is frozen
before release.

### A.7 Magnitude and direction of the error

- `days = daysBetween(computeDate, paymentDate)`. Since `computeDate ≤
  releaseDate ≤ paymentDate`, the count is **too high** — the borrower is
  **over-charged**, always in the lender's favour.
- Size ≈ (releaseDate − computeDate) days of interest. Example ₱200,000 @
  5%/mo: one extra day ≈ ₱323–357 depending on month length; a 3-day gap between
  CSA computing and LRA releasing ≈ ₱1,000.
- Also shifts *which* month some days are attributed to (now that Task 3 made
  the divisor per-day), so the effect is not purely linear.
- Frequency: every daily loan where CSA computes on a different date than LRA
  releases — i.e. essentially all of them unless release is same-day.

### A.8 The business question the code cannot answer

If CSA plans release for the 10th and the borrower signs "10 days interest =
₱X", but disbursement actually happens on the 12th:

- **Model 1 — fixed at signing (like a fixed-term note / PDC):** ₱X stands. The
  borrower pays the interest they signed for; release-date slippage is not
  re-priced. Matches every other part of this system.
- **Model 2 — per-diem to actual release:** interest = rate × actual-days-held,
  finalised at release. More "fair" per-day, but needs finalisation logic + a
  borrower re-acknowledgement + PDC handling.

The Sept-04 call did **not** raise this — the client asked only about the
divisor. **This plan implements Model 1** (lowest risk, architecture-consistent)
and flags Model 2 as a client decision.

### A.9 Timezone parsing sub-issue (pre-existing, but now it bites)

`persistComputation` parses both dates with bare `new Date(str)` (lines 470,
509). `new Date("2026-03-01")` is UTC midnight; `daily.ts` then reads local
`.getFullYear()/.getMonth()/.getDate()`. On a server whose zone is behind UTC,
`"2026-03-01"` reads back as Feb 28 — wrong month, and now a wrong divisor. PH
(UTC+8) and UTC servers are unaffected. Every date helper in the repo shares
this assumption, so it is not new — but a CSA-entered release/payment pair that
silently shifts a day changes the interest, so the daily branch should parse
Y-M-D explicitly.

---

## Part B — Options

### Model 1 — give the daily flow a real release date (RECOMMENDED, planned below)

Add an explicit **Release date** input to the Daily calculator (CSA and
Committee), validate `release < payment`, and feed it through the
already-existing `body.releaseDate → input.releaseDate → persistComputation`
channel. Interest stays frozen at signing, computed over the two dates the
borrower can see and signs. `recordRelease` stops overwriting `release_date`
for daily so the signed accrual basis survives.

- **Pros:** small, surgical; no migration; no change to signing / PDC / re-ack;
  non-daily untouched; the figure the borrower signs is the figure they pay.
- **Cons:** if actual disbursement slips off the planned date, the interest is
  not re-priced (that's the Model-1 definition); `masterlist.release_date` for a
  daily loan becomes the *planned* date, which can move a loan between reporting
  periods if release crosses a month boundary (tiny population, short spans).

### Model 2 — finalise daily interest at actual release

In `recordRelease`, for `payment_frequency = 'daily'`, recompute
`total_interest / total_loan / monthly_amortization` from the real release date,
regenerate the single AR row and the PDC expectation, and require the borrower
to re-acknowledge the final amount (mirroring the committee-override re-sign).

- **Pros:** interest exactly matches days the borrower held the money.
- **Cons:** touches signed-document integrity, the PDC pipeline and adds a
  borrower re-ack gate; larger blast radius; needs the client to want per-diem
  semantics. **Not planned here** — raise with the client first.

### Model 3 — "term in days" instead of a release-date field

CSA enters *payment date* + *number of days*; release date is derived. Rejected:
Task 3 explicitly says daily "ignores terms", and a two-date form is closer to
what the borrower signs.

---

## Part C — Phased plan (Model 1)

### Guiding constraint

Touch only: the Daily branch of `ComputationPanel.tsx`, the CSA compute route's
validation, the Daily branch of `persistComputation` / `daily.ts` date parsing,
the Daily guard in `recordRelease`, and (Phase 5) the Committee override
plumbing. **No migration.** **No Supabase MCP.** Non-daily schedule behaviour
must be byte-identical before and after.

---

### Phase 0 — Client decision gate

Confirm **Model 1** (fixed at signing) vs **Model 2** (per-diem to release) with
the client. If Model 2, stop and re-plan. Everything below assumes Model 1.

---

### Phase 1 — CSA UI: a Release date input for Daily

**File:** `src/components/csa/ComputationPanel.tsx` (Daily branch only).

- Add a `releaseDate` state string next to the existing `paymentDate` state
  (`~line 592`).
- Render a `<Label required>Release date</Label>` + `<Input type="date">` in the
  `selectedScheduleType === "daily"` block (`~lines 1691-1704`), immediately
  above the existing Payment date field.
- Default it to **today** (`new Date().toISOString().slice(0,10)`) so an
  untouched form reproduces current behaviour; CSA edits it to the planned
  disbursement date.
- Client-side validation before submit (`~line 1338`, beside the existing
  `!paymentDate` check): require `releaseDate`, and require
  `releaseDate < paymentDate` — block with a clear message otherwise.
- In the POST body (`~line 1405`), when `selectedScheduleType === "daily"` add
  `releaseDate` alongside `paymentDate`. Do **not** send it for any other
  schedule type (keeps non-daily on the server default).
- Prefill from `computation.releaseDate` when editing an existing daily
  computation (so re-compute keeps the chosen date instead of snapping to
  today).

**Done when:** a Daily computation can only be submitted with a release date
strictly before the payment date; no other schedule type sends `releaseDate`.

---

### Phase 2 — CSA compute route: validate `releaseDate` for Daily

**File:** `src/app/api/csa/applications/[id]/computation/route.ts`.

- Keep `releaseDate: z.string().optional()` but add a refinement / explicit
  check: when the resolved schedule is `daily`, `releaseDate` is **required**,
  must parse as a valid `YYYY-MM-DD`, and must be strictly before
  `body.paymentDate` → `400` with a specific message (mirror the existing
  `"Payment date is required for Daily Interest loans"` check near line 250).
- For non-daily, ignore `releaseDate` exactly as today (it is already only
  forwarded, never used server-side for non-daily via this field).
- No change to the `persistComputation({ ..., releaseDate: body.releaseDate })`
  forwarding at line 446.

**Done when:** the route rejects a Daily compute with a missing / malformed /
not-before-payment release date, and accepts a valid one.

---

### Phase 3 — Engine: parse the Daily dates as local calendar dates

**Files:** `src/lib/csa/computation.ts` (Daily branch) and/or
`src/lib/computation/daily.ts`.

- In the `isDaily` branch of `persistComputation` (`~lines 508-575`), build the
  `releaseDate` and `paymentDate` passed to `computeDailyInterestLoan` from an
  explicit `YYYY-MM-DD` split (e.g. `new Date(y, m - 1, d)`), not
  `new Date(str)` — so a CSA-entered date maps to the intended calendar day
  regardless of server zone (A.9).
- Do **not** change the non-daily `releaseDate` parse at line 470 (that value
  still feeds the monthly/weekly/etc. path and must not shift).
- Optionally centralise as a tiny `parseLocalDate(str)` helper in
  `daily.ts` (exported, unit-tested) rather than inline.

**Done when:** `computeDailyInterestLoan` receives dates whose `.getDate()` /
`.getMonth()` equal the digits the CSA typed, on any server timezone.

---

### Phase 4 — LRA: don't overwrite `release_date` for Daily

**File:** `src/lib/lra/release-service.ts` (`recordRelease`, lines 1169-1172).

- Guard the overwrite: only run the
  `update({ release_date: <today> })` when the computation's
  `payment_frequency !== 'daily'`. For daily, the CSA-entered planned release
  date **is** the accrual basis the borrower signed — keep it.
- Fetch `payment_frequency` for `file.computationId` first (one extra select,
  or extend the existing `release_files`/computation read already in the
  function).
- Add a code comment pointing at this plan and A.4/A.8.

**Alternative if reporting must show the *actual* disbursement day for daily:**
add an `accrual_release_date` column (migration) that stores the CSA date, keep
`release_date` overwritten with actual, and point `daily.ts`'s window at the new
column. Heavier — only if the client says daily loans must report on the true
disbursement date. Default: the guard above, no migration.

**Done when:** releasing a Daily loan leaves `computations.release_date` equal
to the CSA-entered date; releasing any other type is unchanged.

---

### Phase 5 — Committee override / negotiation plumbing

**Files:** `src/app/api/committee/applications/[id]/override/route.ts`,
`src/lib/negotiation/service.ts`.

- Add `releaseDate: z.string().optional()` to the override route schema.
- Add `releaseDate?: string` to `OverrideInput` (`negotiation/service.ts:317`).
- In `persistOverrideComputation`: resolve `releaseDate` the same
  explicit-wins / omission-preserves-existing way `paymentDate` is resolved
  (`~line 477`) — `input.releaseDate ?? existingComp?.release_date ?? undefined`
  (add `release_date` to the `existingComp` select at line ~372), and pass it as
  `releaseDate` into the `persistComputation({...})` call (lines 482-544).
- Apply the same "required + before payment date for daily" validation as
  Phase 2.
- Committee override already clears the signature (borrower re-signs), so no
  extra re-ack work here.
- The Committee calculator UI reuses `ComputationPanel` in `mode === "committee"`
  (`ComputationPanel.tsx:1378`), so the Phase 1 field appears there
  automatically — verify it submits to the override endpoint with `releaseDate`.

**Done when:** a Committee override of a Daily loan computes interest over the
Committee-entered (or preserved) release→payment window, not `new Date()`.

---

### Phase 6 — Tests

- `src/lib/computation/__tests__/daily.test.mts` — already covers the engine
  given explicit dates. Add: `parseLocalDate` cases if a helper is introduced.
- New `src/lib/csa/__tests__/*.mts` (or extend an existing one): persist a Daily
  computation with an explicit `releaseDate` far from "now" and assert the
  stored `total_interest` equals the engine result for that exact window —
  i.e. it does **not** depend on the current date. (Mirror how other
  `computation.test.mts` cases call the pure functions; a full DB round-trip
  isn't required — asserting the branch inputs is enough.)
- New coverage for `recordRelease`: daily → `release_date` unchanged; monthly →
  `release_date` overwritten (guard against regression). Follow
  `src/lib/lra/__tests__/release-service.test.mts` patterns.
- Route validation: Daily without `releaseDate` → 400; with
  `releaseDate >= paymentDate` → 400.

**Done when:** `npm test` green with the new cases; the "independent of now"
assertion passes.

---

### Phase 7 — Show the accrual window in the breakdown

**File:** `src/components/csa/ComputationPanel.tsx` (`buildComputationSteps`,
`~line 253`).

- For daily, add/adjust a row so the borrower and Committee see the exact
  window: e.g. `Release <date> → Payment <date>, N days` and keep the per-day
  divisor label from Task 3. The signed object already carries `releaseDate` /
  `firstPaymentDate`; this just surfaces them next to the interest.
- No logic change — display only.

**Done when:** the Daily "How this was computed" section states the release
date, payment date and day count it used.

---

### Phase 8 — Regression + finalise

- `npm test` (full), `npx tsc --noEmit`, `npm run build`, `eslint` on touched
  files — all green; test count up only by the new cases.
- Update this doc's progress log and the Sept-04 tracker (Task 3 row).
- Confirm existing DB `daily` rows are untouched (no backfill): unreleased ones
  pick up the new field on the next recompute; released ones are done.

---

### Phase 9 — Client review

Demo at a meeting: create a Daily loan, set release date = a few days out,
payment date later; show the interest covers exactly release→payment; change the
release date and show the figure move. Confirm Model 1 (no re-price on
slippage) is acceptable, plus the still-open Task 3 questions (30/30 vs
actual-days, leap-Feb).

---

## Part D — Constraints

### D.1 Files that MAY change

| File | Phase |
| :- | :- |
| `src/components/csa/ComputationPanel.tsx` (Daily branch + daily breakdown row) | 1, 7 |
| `src/app/api/csa/applications/[id]/computation/route.ts` (validation) | 2 |
| `src/lib/csa/computation.ts` (Daily branch date parse only) | 3 |
| `src/lib/computation/daily.ts` (optional `parseLocalDate` helper) | 3 |
| `src/lib/lra/release-service.ts` (`recordRelease` daily guard only) | 4 |
| `src/app/api/committee/applications/[id]/override/route.ts` (schema) | 5 |
| `src/lib/negotiation/service.ts` (`OverrideInput` + `persistOverrideComputation` resolve/forward) | 5 |
| `src/lib/computation/__tests__/daily.test.mts`, new `.mts` test files | 6 |

### D.2 Files / behaviour that MUST NOT change

- `persistComputation`'s non-daily `releaseDate` parse (`csa/computation.ts:470`)
  and every non-daily schedule generator (`sf.ts`, `sme.ts`, `invoice.ts`, the
  bi-monthly / quarterly / two-monthly generators, `ar/schedule.ts`,
  `discount-units.ts`).
- `initializeArAccount` / `buildExpectedPdcSchedule` — they keep reading the
  frozen totals; no recompute is added (that would be Model 2).
- The signing flow and `signature_hash` — no re-verification, no new re-ack.
- `recordRelease`'s overwrite for **non-daily** — unchanged.
- The Task 3 per-day divisor logic in `daily.ts` — unchanged; this plan only
  changes which two dates bound the accrual.

### D.3 Data / tooling

- **No migration** in the recommended path (reuses `computations.release_date`
  and the already-present `body.releaseDate`). The only scenario needing one is
  the Part-D alternative in Phase 4 (`accrual_release_date` column) — do not do
  it unless the client asks.
- **Do not use the Supabase MCP** — pure application code.
- **No backfill** of existing `daily` computation rows.
- Two-folder migration convention still applies *if* a migration is ever added
  (`loanstar/supabase/migrations` + `supabase/migrations`).

---

## Part E — What this plan does NOT fix

- **Release-date slippage re-pricing** (Model 2). If disbursement happens on a
  different day than the CSA-entered release date, the interest is not
  recalculated. Deliberate — Model 1. Revisit only on client request.
- **Non-daily `first_payment_date` drift.** Non-daily schedules also store a
  compute-date-derived `first_payment_date`; `initializeArAccount` reuses it
  rather than recomputing from the overwritten `release_date`. Pre-existing,
  separate, not in scope.
- The `signature_hash` being non-authoritative (never re-verified). Noted, not
  touched.

---

## Part F — Open questions for the client

1. **Model 1 vs Model 2** (Part A.8 / B). This plan assumes Model 1.
2. If Model 1: should a daily loan's **report/dashboard** `release_date` be the
   *planned* date (recommended, no migration) or the *actual* disbursement date
   (needs the Phase 4 alternative + migration)?
3. Inherited Task 3 questions: actual-days vs fixed 30/30; leap-year Feb = 29.

---

## Part G — Progress log

- 2026-09-07 — Audit complete, Model 1 plan written (Claude). Not yet
  implemented. Phase 0 (client decision) outstanding.
