# SME & Individual Calculator Alignment — Per-Borrower Rates, History, Payment Date

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax. The user runs **one phase at a time** and reviews before the next starts.

**Goal:** Align the SME and Individual computation flow with the workflow decided in the 2026-08-13 client
call (transcript reviewed 2026-08-25) and a follow-up clarification (2026-08-25) on how `segment =
"individual"` fits in. Today, every SME/individual loan is silently forced onto a single generic rate
regardless of the actual account, and the first payment date uses the Seafarer 22nd-cutoff rule for both,
which the client confirmed is wrong for SME and unconfirmed (still an open question) for individual.

**Scope note (revised after a second round of clarification):**
- **Rate editability (Interest / Processing Fee / Admin Fee / CMF) applies to `segment === "sme"` AND
  `segment === "individual"`** — the client's follow-up answer confirmed "the same calculator is used for
  individual loans and SME loans," both editable by accounting, with individual's Admin Fee/CMF simply
  **defaulting to 0** rather than being removed (per user's explicit choice — see Locked Decision #2).
  **Seafarer is the only segment that stays fixed/non-editable.**
- **First-payment-date rule stays `segment === "sme"` only.** The call separately described *different*
  payment-timing rules for individual's sub-types (MPL: end-of-month; Salary: 15th-and-end-of-month — both
  given by the user as "based on my understanding," not confirmed with the same rigor as SME's "+1 month,
  same day" rule). Applying SME's date rule to individual would be assuming an answer never actually given.
  Individual keeps `computeFirstPaymentDate` (the Seafarer rule) unchanged until its own rule is confirmed.
- `entityType` (`"individual" | "corporate"`, only meaningful when `segment = "sme"` — sole proprietorship
  vs. corporation) remains a **third, unrelated** concept, not to be confused with `segment = "individual"`.

---

## Audit — confirmed root causes

1. **`loan_types` has exactly one SME row.** `SME - Standard`, 3.00% interest / 8.00% PF — the client's own
   Excel rate table (`SME!EN3:ES500`) holds ~58 individually-negotiated accounts with interest 1.5–3.5%,
   PF 0–11%, admin 0–2%. Every SME loan in the system computes against this one generic rate. Confirmed live
   via `select * from loan_types where segment='sme'`.
2. **`pfRate`/`interestRate` are never freely entered — only looked up by `loanTypeId`.** Confirmed in
   `src/app/api/csa/applications/[id]/computation/route.ts:180-234`, `src/lib/negotiation/service.ts:343-386`
   (both pre-decision and override paths). This applies to **both** `sme` and `individual` today — neither
   can type a custom rate. The *only* free-text field wired end-to-end today is `adminRate` in the CSA route
   (`computation/route.ts:30`), and even that has no UI input anywhere (`ComputationPanel.tsx` has zero
   matches for "admin" as an input, confirmed by search).
3. **`chattelRate`/`chattelFee` (CMF) has no UI, no request field, and no storage column at all.**
   `sme.ts` computes `chattelFee` correctly (`computeSmeLoan`, using `chattelRate ?? 0`) and folds it into
   `totalDeductions`/`netReleased` correctly, but nothing ever sends a non-zero `chattelRate`, and the
   computed fee has nowhere to be itemized in `computations` (schema checked — no `chattel_fee` column).
   `computeSmeLoan` is already the shared engine for both `sme` and `individual` (confirmed in
   `src/lib/csa/computation.ts`: `segment === "sme" || segment === "individual"` routes to it) — so this gap
   affects both today.
4. **Committee's override schema is missing rate fields entirely.** `override/route.ts:19-68`
   (`overrideSchema`) accepts `amount`, `inputMode`, `terms`, `addonMonths`, `loanTypeId`, `otherDeductions`
   — no `adminRate`, no rate override of any kind. Per the client call, Committee is supposed to be the
   stage that actually finalizes Interest / Processing / Admin / CMF — right now it structurally cannot, for
   either segment.
5. **No persisted rate history.** `computations` has no `admin_rate` or `chattel_rate` columns (schema
   checked directly), so even if the fields existed, there would be nothing to look up for the "pre-fill
   with this borrower's last-used rate" behavior the client asked for.
6. **First payment date uses the Seafarer rule for both SME and individual today.**
   `src/lib/csa/computation.ts:226-232` calls `computeFirstPaymentDate` (the 22nd-cutoff rule)
   unconditionally, regardless of `segment`. Confirmed wrong for SME (client: "+1 month, same day, no
   cutoff"). For individual, the correct rule is still unconfirmed (see Deferred) — so it is *not* being
   fixed by this plan, only SME's is.
7. **LRA already has no computation-edit access** — confirmed by search: `src/app/lra/applications/[id]/page.tsx`
   never imports or renders `ComputationPanel`. This matches the client's decision exactly; nothing to change
   here except *not* accidentally adding edit capability in a later phase.
8. **`loanTypeName` is printed on 4 generated documents** — `final-computation-sheet.ts:146`,
   `application-form-context.ts`, `acknowledgement-receipt.ts`, `lra/template-context.ts` all read it for
   the "Loan Type" line. If `loanTypeId` were dropped entirely (an earlier draft of this plan implied that),
   those documents would silently print a blank loan type. **Correction applied:** `loanTypeId`/
   `loanTypeName` stay required and label-only for both sme and individual — only the *rates* (`pfRate`,
   `interestRate`, `adminRate`, `chattelRate`) stop being sourced from `loan_types`.
9. **`segment = "individual"` is a distinct product from SME**, with its own sub-types (MPL/Auto/REM/Salary,
   per the call) — 4 live applications carry `segment = "individual"` today. It is *not* the same as
   `entityType = "individual"`, which only exists within `segment = "sme"` applications (sole proprietorship
   vs. corporation — `create-application.ts:19,25-27`). Both are real, separate concepts; do not conflate
   them anywhere in this work.
10. **Coverage-ratio check currently differs between the two segments** and this plan does not change that:
    `skipCoverageForSegment` (`coverage.ts:62`) exempts only `sme` from the 35% coverage check —
    `individual` still gets it, same as Seafarer. Nothing in the 2026-08-25 clarification addressed this, so
    it stays exactly as today for both segments.
11. **`ComputationPanel` never receives the application's `segment` today.** Confirmed at both render sites —
    `src/app/csa/applications/[id]/page.tsx:1239-1244` and
    `src/app/committee/applications/[id]/page.tsx:2001-2013` — neither passes it, even though both pages
    already have `data.application.segment` available and use it elsewhere on the same page (e.g. CSA
    page's `isSme` at line 552; Committee page's `isSme`/`isIndividual` at lines 640-641). Phase 2 must add a
    real `segment` prop, wired from both call sites — this is more than the "prop-type additions" an earlier
    draft of this plan implied.
12. **Committee's override path always sources `pfRate`/`interestRate` from `loanType`, and drops
    `adminRate`/`chattelRate`/`withDsAndNotary` entirely.** `negotiation/service.ts`'s `OverrideInput` type
    (lines 309-318) and `persistOverrideComputation` (321-401) have no fields for any of these, and the
    `existingComp` select (330) doesn't fetch them either. Today this means a Committee override on an SME
    computation silently resets admin/CMF to their defaults even if CSA had set them. Once rates are
    free-text, an override that omits rate fields must **preserve the active computation's existing rate**
    (same "explicit input wins, omission preserves existing" pattern already used there for
    `otherDeductions`, lines 393-399) — not fall back to `loanType`, which stops being the source of truth
    for sme/individual rates.
13. **No existing rate-input UI convention to follow.** Checked every numeric input in
    `ComputationPanel.tsx` (lines 638-825) — all are amount/terms/count fields. `securityFeeRate` is the
    only rate-shaped value in the component today, and it's display-only (`pct()`-formatted, line 1031),
    never typed. Rates are stored as decimals (`loan_types.pf_rate = 0.08` for 8% — confirmed live). The new
    Interest/Processing/Admin/CMF inputs must be specified explicitly as **percent-typed, decimal-stored**
    (user types `8`, component divides by 100 before sending `0.08`) — a real off-by-100 risk if left
    unspecified, not an existing pattern to copy.
14. **`computations_select` RLS policy is module-wide, not per-application** — confirmed via `pg_policies`:
    CSA/Committee/etc. read access is gated on `has_module_permission('computation','view')` with no
    `loan_application_id` scoping (plus a separate borrower-owns-it clause). This means Phase 3's
    cross-application borrower-rate-history query works under normal RLS with the regular (non-service-role)
    client — unlike the masterlist RLS gap hit earlier this session, which needed `createServiceClient()`.
    Do not add an unnecessary service-role workaround in Phase 3.
15. **`loan_types` has zero rows for `segment = 'individual'`** — confirmed live (`group by segment` →
    `seafarer: 33, sme: 1`, no `individual` row at all). Yet 10 real `computations` rows exist for
    individual-segment applications, all referencing **Seafarer** loan-type names/rates (`"DIRECT"` at PF
    10%/interest 1.99%, `"FRESH NNO BRONZE"` at PF 11.34%/interest 2.25%). The `loanTypeId` lookup
    (`computation/route.ts:180-207`) never filters by the loan type's own `segment` column — it just fetches
    by id. **Individual loans are being computed against arbitrary Seafarer rate cards today, because there
    is no legitimate "individual" product to pick.** This is independent, concrete confirmation that Locked
    Decision #1 is the correct fix, not scope creep — it resolves a real, currently-happening problem, not
    a hypothetical one.

---

## What was decided (2026-08-13 call + 2026-08-25 follow-up clarification, both confirmed by user)

1. **No per-account "enrollment" table** (rejects modeling the Excel's 58-account lookup in `loan_types`).
2. **The same calculator/engine is used for SME and individual loans.** Both get the same 4 editable fields
   (Interest, Processing Fee, Admin Fee, CMF), editable by accounting (CSA initially, Committee
   authoritatively). **For individual, Admin Fee and CMF default to 0 and are not required** — shown, not
   hidden (user's explicit choice: "Show, defaulted to 0" over "hide entirely"). **Seafarer is the only
   segment that stays fixed and non-editable.**
3. CSA's first computation uses non-authoritative default/placeholder rates (both segments).
4. **Committee is the real decision-maker** — freely types Interest / Processing Fee / Admin Fee / CMF.
5. **Borrower rate *history*, not enrollment** — pre-fill the four fields with whatever was last used for
   that specific borrower (their full loan record history, all rates ever used), as a convenience default
   only. Committee can always override it.
6. **LRA has no edit access to rates** — read-only on whatever Committee finalized.
7. **Re-negotiation window** (SME/individual, not Seafarer): as long as the check hasn't been released,
   borrower can request to reopen. Borrower dashboard → notifies LRA → LRA forwards to Committee → Committee
   re-decides. **Out of scope for this plan** — see "Deferred" below.
8. **SME first payment date:** exactly release date + 1 month, same day-of-month. No cutoff, no fixed
   due-day like Seafarer's. **Individual's own rule (MPL: end-of-month; Salary: 15th-and-end-of-month) was
   given as "based on my understanding," not confirmed with the same rigor — not implemented by this plan.**

---

## Architecture

- **Free-text *rate* inputs (Interest, Processing Fee, Admin Fee, CMF) replace the *rate* lookup, for
  `segment === "sme"` AND `segment === "individual"`.** Only `seafarer` keeps today's `loanTypeId`-driven
  rate flow — confirmed by the client as the one segment that stays fixed.
- **For `individual`, Admin Fee and CMF inputs are shown but default to 0 and are optional** — not required,
  not hidden. This is a UI/validation distinction only; the underlying fields and storage are identical
  between `sme` and `individual`.
- **`loanTypeId`/`loanTypeName` stay required for both segments — label only.** CSA still picks a loan type
  for document-printing purposes (finding #8); only `pfRate`/`interestRate`/`adminRate`/`chattelRate` stop
  being read from `loan_types.pf_rate`/`interest_rate`. `loan_types` itself is untouched — not repurposed,
  not extended with per-account rows (the call explicitly rejected that model).
- **History is read-only reference data, computed from existing `computations` rows** (joined through
  `loan_applications.borrower_id`), not a new "enrollment" table — matches decision #5. Scoped to match the
  current application's own segment (an SME application's history shows past SME rates; an individual
  application's history shows past individual rates) — the call didn't say to pool the two products
  together, and they have different fee shapes (individual's admin/CMF are normally 0), so pooling them
  would produce a misleading "last used" default. Flagged for confirmation in Phase 3, not assumed silently.
- **New nullable columns on `computations`**: `admin_rate`, `chattel_rate`, `chattel_fee`,
  `with_ds_and_notary`. Nullable/optional so Seafarer rows are unaffected and existing SME/individual rows
  just read back `null` for fields that were never captured historically.
- **`persistComputation` branches the first-payment-date rule by segment** — a new
  `computeSmeFirstPaymentDate` in `release-date.ts`, used **only** when `segment === "sme"`;
  `computeFirstPaymentDate` (22nd-cutoff) stays exactly as-is for `seafarer` **and** `individual` (individual's
  correct rule is still unconfirmed — do not apply either function speculatively).
- **Coverage-ratio behavior is untouched** — `skipCoverageForSegment` keeps exempting only `sme`;
  `individual` keeps getting the 35% check exactly as today.

---

## Ground Rules

- Closed Allow lists per phase. Anything outside → STOP and flag.
- `git diff --stat` after each phase.
- Do not commit unless asked.
- Each phase verified with `tsc --noEmit`, `npm run test`, and a live-data check before moving on.

---

## Hard Constraints

### Never Modify
- **Seafarer's computation path** — `pfRate`/`interestRate` stay `loanTypeId`-driven for
  `segment === "seafarer"` only. No field in `ComputationPanel.tsx`'s Seafarer branch changes shape or
  behavior. Seafarer is the *only* segment excluded from Phase 2's rate-input change.
- **`individual` segment's first-payment-date and coverage-ratio behavior** — both stay exactly as today
  (`computeFirstPaymentDate`, coverage check still applied). Only the *rate-input* behavior changes for
  `individual` (Phase 2); Phase 4 (payment date) explicitly excludes it.
- **`entityType` field and its validation** (`create-application.ts:19,25-27`) — unrelated to this plan;
  do not touch. Do not conflate it with `segment`.
- `computeFirstPaymentDate` (the 22nd-cutoff function) itself — stays exactly as-is, used for Seafarer and
  (until confirmed otherwise) `individual`.
- `sme.ts`'s core formulas — already verified correct against the Excel (this session's earlier validation:
  processing/notary/admin/doc-stamp/interest/monthly all matched a live example exactly). This plan only
  changes *where the rate inputs come from*, not the math inside `computeSmeLoan`.
- LRA's application page (`src/app/lra/applications/[id]/page.tsx`) — must not gain any computation-edit UI,
  any new fetch of rate-editing endpoints, or any new button implying it can change rates. Confirmed already
  has none; keep it that way (decision #6 from the call).
- **Document generators** (`final-computation-sheet.ts`, `application-form-context.ts`,
  `acknowledgement-receipt.ts`, `lra/template-context.ts`) — not in any phase's Allow List; do not edit them.
  `loanTypeName` must keep resolving the same way it does today for every existing computation row.
- **`loan_types` table and any endpoint that reads it for Seafarer** — untouched. Only the SME/individual
  code paths stop reading `pf_rate`/`interest_rate` from it; the `loanTypeId` selector itself (for the
  label) still queries the same table the same way, for all three segments.
- **RLS policies on `computations`** — the new columns are plain nullable `numeric`/`boolean` additions;
  do not add, remove, or alter any RLS policy as part of this plan. If a policy needs a column-list update,
  stop and flag it rather than assuming.
- **Coverage-ratio logic** (`skipCoverageForSegment`, `coverage.ts`) — already correctly `sme`-only; do not
  extend or narrow it as a side effect of touching adjacent code. `individual` keeps the coverage check.
- Anything under `src/lib/computation/sf.ts` or the Offset/Other-Loan internal-transfer feature — unrelated
  subsystems, out of scope, do not touch even incidentally while editing shared files like
  `ComputationPanel.tsx`.

### Touch With Extreme Care
- `computeSmeLoan`'s `chattelRate` default (`?? 0`) — must stay 0 when the field is omitted, so existing
  SME/individual computations (all currently implicitly chattel-free) don't change value.
- The Committee `overrideSchema` — adding rate fields must not loosen any existing validation
  (cross-bucket/duplicate-account checks in `findDuplicateAccountNos`/`findCrossBucketAccountNos` stay
  exactly as they are; only new optional rate fields are added alongside them).
- `ComputationPanel.tsx` is shared by CSA, Committee, and (via `mode` prop) potentially other callers —
  the new rate-input branch must be gated strictly on `segment === "sme" || segment === "individual"`, with
  the Admin Fee/CMF required-vs-optional distinction gated strictly on `segment === "individual"`. Never
  change the Seafarer render path, and never let a missing/unexpected segment value fall into the new branch.
- `application_details.loan_type_id` fallback path (`computation/route.ts:192-207`) — keep this working
  exactly as today for all three segments; only the rate fields read from that lookup change source (and
  only for sme/individual).

---

## Locked Product Decisions

| # | Decision |
|---|---|
| 1 | **`segment === "sme"` and `segment === "individual"`** both get typed numeric rate inputs (Interest, Processing Fee, Admin Fee, CMF), replacing the loan-type rate lookup. **Seafarer is the only segment excluded.** |
| 2 | For `individual`, Admin Fee and CMF are **shown, defaulted to 0, and optional** — not hidden, not required. User's explicit choice over hiding them entirely. |
| 3 | `loanTypeId`/`loanTypeName` remain required for sme/individual, for document-labeling only — decoupled from rates, not removed. |
| 4 | Borrower rate history is read-only reference / pre-fill only — never a locked or reused "enrollment" record. Committee can always override it. History is scoped per-segment (not pooled across sme and individual) — see Phase 3 for why, flagged for confirmation. |
| 5 | Committee is the authoritative stage for finalizing rates; CSA's first pass is explicitly non-authoritative. |
| 6 | LRA gets no computation-edit capability (already true; stays true). |
| 7 | **SME first payment = release date + 1 month, same day.** This rule applies to `sme` only. `individual` keeps the Seafarer 22nd-cutoff rule unchanged — its real rule (MPL/Salary-specific) is unconfirmed and out of scope here. |
| 8 | `individual`'s coverage-ratio check (currently applied, same as Seafarer) is untouched by this plan. |
| 9 | The borrower reopen-negotiation → LRA → Committee workflow (decision #7 from the call) is **out of scope for this plan** — flagged as a separate, larger feature (new borrower UI, LRA queue entry, committee vote re-opening). |

---

## Phase 1: Schema — persist the rate inputs

### Scope
Add nullable columns so rate inputs (once wired, Phase 2) have somewhere to land for both sme and
individual, and so history (Phase 3) has something to read.

### Allow List
- New migration file under `supabase/migrations/`
- `src/lib/csa/computation.ts` (`mapComputationRow`, insert statement — add the 4 fields)

### Tasks
- [x] Migration: `alter table computations add column admin_rate numeric, add column chattel_rate numeric, add column chattel_fee numeric, add column with_ds_and_notary boolean;`
- [x] `mapComputationRow` reads the 4 new columns onto the returned object.
- [x] `PersistComputationInput` (`computation.ts:39-43`): add `chattelRate?: number;` alongside the existing `adminRate`/`withDsAndNotary` — currently missing entirely.
- [x] The `computeSmeLoan({...})` call (`computation.ts:151-160`) currently doesn't pass `chattelRate` at all — add `chattelRate: input.chattelRate ?? 0`. Without this, a typed CMF rate would silently compute as 0 no matter what Phase 2's UI/API send.
- [x] **Scoping fix, not optional:** `const sme = computeSmeLoan(...)` (line 151) is declared inside the `if (segment === "sme" || segment === "individual")` block and is out of scope at the `.insert({...})` call much further down (~line 255+) — an earlier draft of this plan wrote `chattel_fee: sme?.chattelFee ?? null` there, which doesn't compile/resolve. Fix: declare `let smeChattelFee: number | null = null;` before the `if`, set `smeChattelFee = sme.chattelFee;` inside it, and use that variable at the insert.
- [x] `persistComputation`'s insert writes `admin_rate: input.adminRate ?? null`, `chattel_rate: input.chattelRate ?? null`, `chattel_fee: smeChattelFee`, `with_ds_and_notary: input.withDsAndNotary ?? null`. Populated when `segment` is `sme` or `individual`; `null` for `seafarer` rows (the Seafarer branch never sets `smeChattelFee`, so it stays `null` there naturally).

### Verification
- [x] Migration applies cleanly via Supabase MCP.
- [x] `tsc --noEmit` — matches 13-error baseline (13, unchanged).
- [x] `npm run test` — 1349 passed, 0 failures.
- [x] Live insert via a throwaway SME computation *and* a throwaway individual computation, **including a non-zero `chattelRate`**, confirms all 4 columns populate correctly for both — SME: `adminRate: 0.01, chattelRate: 0.02, chattelFee: 2140, withDsAndNotary: true`; individual: all zeros/false as configured. Confirmed via both the JS return value and a direct DB read. Cleaned up, 0 leftover rows.
- [x] Live insert of a Seafarer computation confirms all 4 new columns come back `null` (not `0`/`false`), exactly as specified. Cleaned up.
- [x] `git diff --stat` — only `src/lib/csa/computation.ts` (71 insertions/8 deletions) plus the new migration file. Nothing outside Phase 1's Allow List touched.

---

## Phase 2: Free-text rate inputs (CSA + Committee), both sme and individual

### Scope
For `segment === "sme"` and `segment === "individual"`: stop sourcing `pfRate`/`interestRate` from
`loan_types` and accept them as direct numeric inputs, alongside the already-partially-wired `adminRate` and
the new `chattelRate`/`withDsAndNotary`. For `individual`, Admin Fee/CMF default to 0 and are optional
(Locked Decision #2). `loanTypeId`/`loanTypeName` stay in the request — still required, still resolved from
`loan_types` — but now used **only** for the label, not the rates. `seafarer` keeps 100% of today's behavior.

### Allow List
- `src/app/api/csa/applications/[id]/computation/route.ts`
- `src/app/api/committee/applications/[id]/override/route.ts`
- `src/lib/negotiation/service.ts`
- `src/components/csa/ComputationPanel.tsx`
- `src/app/csa/applications/[id]/page.tsx`, `src/app/committee/applications/[id]/page.tsx` (prop-type additions only)
- **`src/app/api/committee/applications/[id]/route.ts` — added during implementation, not in the original
  Allow List.** Discovered the same class of bug already fixed once this session for `firstPaymentDate`:
  this route builds an explicit field whitelist for `computation` in its GET response, which would have
  silently dropped `adminRate`/`chattelRate`/`chattelFee` (needed for the pre-fill and the CMF display line)
  even though Phase 1 already stores them. Fixed by adding the 3 fields to that whitelist.

### Tasks
- [x] CSA `computeSchema`: add `pfRate` **and** `interestRate` (both missing today — finding B, corrected from an earlier draft that only mentioned `pfRate`) plus `chattelRate` as optional numbers (`adminRate`, `withDsAndNotary` already exist — confirmed in the audit). At the `persistComputation(supabase, {...})` call (`computation/route.ts:236-255`), `pfRate: Number(loanType.pf_rate)` and `interestRate: Number(loanType.interest_rate)` (lines 245-246) are currently hardcoded from the lookup — for `segment` `sme`/`individual`, use `body.pfRate`/`body.interestRate` when present instead; add `chattelRate: body.chattelRate` (currently absent from this call entirely). `loanType` lookup still runs unconditionally for the label. For `seafarer`, behavior is byte-for-byte unchanged — rates always come from `loanType`.
- [x] `ComputationPanelProps`: add a required `segment: "seafarer" | "sme" | "individual"` prop (finding #11 — currently missing entirely, not just an unwired type). Both `src/app/csa/applications/[id]/page.tsx` and `src/app/committee/applications/[id]/page.tsx` pass `segment={data.application.segment}` at their respective `<ComputationPanel>` call sites.
- [x] Committee `overrideSchema`: add the same 5 optional fields (`pfRate`, `interestRate`, `adminRate`, `chattelRate`, `withDsAndNotary` — `negotiation/service.ts`'s `OverrideInput` type currently has none of these, finding #12). `persistOverrideComputation`'s `existingComp` select (line 330) adds the Phase-1 columns (`admin_rate, chattel_rate, with_ds_and_notary` — `pf_rate`/`interest_rate` already selected). Its `persistComputation(supabase, {...})` call (lines 373-401) currently passes neither the new fields nor a rate override at all — for `segment` sme/individual, add `adminRate`/`chattelRate`/`withDsAndNotary` to that call, each set from `input.<field> ?? existingComp?.<column> ?? undefined` (explicit input wins; omission preserves the active computation's existing value — same pattern already used there for `otherDeductions`, lines 393-399); the `pfRate`/`interestRate` lines (385-386, currently always `Number(loanType.pf_rate/interest_rate)`) get the identical treatment. For `seafarer`: unchanged, always `loanType`, no new fields passed.
- [x] `ComputationPanel.tsx`: when segment is `"sme"` or `"individual"`, render 4 numeric inputs (Interest %, Processing Fee %, Admin Fee %, CMF %) in addition to the existing loan-type dropdown (kept, for the label). **Inputs are percent-typed, decimal-stored** — the displayed/typed value is `rate * 100` (e.g. `8` for 8%), converted to `rate / 100` before being sent to the API (finding #13; matches how `pct()` already *displays* `securityFeeRate`, just now also accepting input the same way in reverse). For `individual` specifically, Admin Fee/CMF inputs default to `0` and are not marked required. Seafarer's existing render path is untouched — verify with an explicit segment check, not a fallback/else branch.
- [x] `chattelFee` added as its own displayed line item for sme/individual (mirrors how `securityFee` is already shown).

### Verification
- [x] `tsc --noEmit` — 13 errors, matches baseline (one pre-existing baseline error's message grew longer since the inferred computation shape gained fields, but it's the same pre-existing fixture gap, not a new error).
- [x] `npm run test` — 1349 passed, 0 failures.
- [x] Live test: CSA computes an SME loan with custom rates (2.8% interest, 7% PF, 1% admin) → stored row matches exactly (`pfRate: 0.07, interestRate: 0.028, adminRate: 0.01`), not the old flat 3%/8%, and `loanTypeName` still populates from the selected label ("TEST LABEL").
- [x] Live test: Committee overrides the same SME application, changing only `amount` (no rate fields in the request) → new version **preserved** the previous rates exactly (`0.07/0.028/0.01`), not reset to `loan_types`' generic 3%/8%. Confirms the Phase 2 fix for finding #12.
- [x] Live test: Committee overrides again with explicit new rates (9%/3%/2%) → new active version reflects those explicit values, confirming explicit input still wins over preservation.
- [x] Live test: a direct `persistComputation` call for `segment: "seafarer"` confirms the new columns (`adminRate`/`chattelRate`) still come back `null` — the segment-gating logic lives in the route layer (verified by code inspection of the exact conditional, which reduces to the original unconditional `Number(loanType.pf_rate)` whenever `segment !== "sme" && segment !== "individual"`), not inside `persistComputation` itself, which has never gated by segment for these fields at any point in this plan.
- [x] All test rows cleaned up, 0 leftover.
- [x] `git diff --stat` scoped to Phase 2's Allow List (+ the one justified addition) shows only those 7 files touched.

---

## Phase 3: Borrower rate history (pre-fill, read-only reference)

### Scope
Show the borrower's past sme/individual loan rates as reference, pre-filling the 4 fields as an editable
default — never locking them. **Open question resolved before implementing:** confirmed via
`AskUserQuestion` — history stays scoped to the current application's own segment (not pooled), matching
the plan's default.

### Allow List
- `src/lib/csa/computation.ts` — new `getSmeRateHistory` function + `SmeRateHistoryEntry` type
- `src/app/api/csa/applications/[id]/route.ts` — `rateHistory` added to the response
- `src/app/csa/applications/[id]/page.tsx` — type + passes `rateHistory` to the panel
- `src/components/csa/ComputationPanel.tsx` (render history list + pre-fill)

### Tasks
- [x] Query (`getSmeRateHistory`): for the application's `borrower_id`, all past `computations` rows (joined via `loan_applications!inner`) where `loan_applications.segment` matches the current application's segment and `loan_application_id` is not the current application itself, most recent first, limit 10 — application no, date, interest/PF/admin/CMF used. Uses the regular request-scoped client, **not** `createServiceClient()` — confirmed unnecessary (finding #14). Returns `[]` early for `seafarer` or when the application has no `borrower_id`.
- [x] Surface as a small read-only list ("Previous rates for this borrower") in `ComputationPanel`, gated on `isRateEditableSegment`, plus pre-fill the 4 inputs from the most recent entry — but **only when there's no active `computation` yet** (a brand-new form): a separate `useEffect` keyed on `[computation, isRateEditableSegment, rateHistory]`, since the existing hydration effect already takes priority once a real computation exists.
- [x] `rateHistory` prop defaults to `[]` — Committee mode doesn't fetch/pass it (not in this phase's Allow List), so its render path simply omits the history list without any code change needed there.
- [x] No new table, no "reuse" semantics — confirmed against decision #5.

### Verification
- [x] `tsc --noEmit` — 13 errors, baseline unchanged.
- [x] `npm run test` — 1349 passed, 0 failures.
- [x] Live test: created a second sme application for the same borrower as a real application (`AN300018`, borrower `8c1c61c5...`) with distinct rates (6% PF / 2.5% interest / 1.5% admin) → `getSmeRateHistory(primaryApplicationId)` correctly returned it, **and** organically surfaced two more real prior computations for that same borrower (`AN300014`) already in the database — confirming the query finds genuine multi-loan history, not just synthetic test data.
- [x] Live test: confirmed the query **excludes the application's own computation from its own history** (`neq("loan_application_id", ...)` works).
- [x] Live test: confirmed a Seafarer application gets an empty history array (segment gate works).
- [x] Test rows cleaned up.
- [x] `git diff --stat` — only the 4 Allow-listed files touched.

---

## Phase 4: SME first payment date rule (sme only)

### Scope
Fix `first_payment_date` for `segment === "sme"` to "release + 1 month, same day," per the client's
2026-08-25 confirmation. `individual` keeps using `computeFirstPaymentDate` (unchanged) until its own rule
(end-of-month for MPL, 15th-and-end-of-month for Salary — both still unconfirmed) is separately confirmed.

### Allow List
- `src/lib/computation/release-date.ts` (new `computeSmeFirstPaymentDate`)
- `src/lib/csa/computation.ts` (branch by segment)

### Tasks
- [x] Add `computeSmeFirstPaymentDate(releaseDate: Date): Date` — release date's calendar day, month + 1 (handling year rollover and short months, e.g. Jan 31 release → Feb 28/29). No `addonMonths` parameter — the locked decision is a flat +1 month, unlike Seafarer's rule.
- [x] `persistComputation`: use `computeSmeFirstPaymentDate` only when `segment === "sme"`; `computeFirstPaymentDate` (unchanged) for `seafarer` **and** `individual`. `due_day` keeps being stored on every row regardless of segment — known, deliberate inert leftover for SME rows, not fixed under this plan.

### Verification
- [x] `tsc --noEmit` — 13 errors, baseline unchanged.
- [x] `npm run test` — 1349 passed, 0 failures.
- [x] Live test: SME computation with release date Aug 24, 2026 → `first_payment_date` = **2026-09-24** exactly (not the old rule's Nov 10).
- [x] Live test: an `individual`-segment computation with the same release date (addon 2, due day 10) → **2026-11-10**, the unchanged old 22nd-cutoff result — confirms `individual` truly untouched.
- [x] Live test of the 3 edge cases the function's own docstring claims: Jan 31 2026 → **2026-02-28** (short-month clamp); Dec 15 2026 → **2027-01-15** (year rollover); Jan 29 2028 → **2028-02-29** (leap-year Feb 29 handled correctly, not clamped to 28).
- [x] All test rows cleaned up, 0 leftover.
- [x] `git diff --stat` — only the 2 Allow-listed files touched.

---

## Phase 5: Regression sweep

### Tasks
- [x] `npx tsc --noEmit` — 13 errors, baseline unchanged across all 4 phases.
- [x] `npm run test` — 1349 passed, 0 failures.
- [x] `git diff --stat` scoped to all 10 tracked files touched across every phase + the Phase 1 migration (untracked, confirmed present separately) — nothing outside this set touched anywhere in the plan.
- [x] Live: a full end-to-end Seafarer computation (real loan type, real rates) → `firstPaymentDate` still uses the 22nd-cutoff rule correctly (Nov 10 for an Aug 24 release + 2 addon months + due day 10), `adminRate`/`chattelRate` both `null`, `coverageWarning` behaves normally.
- [x] Live: SME `coverage.ratio` stays `null` (exempt) — unchanged.
- [x] Live: **individual `coverage.ratio` is still a real computed number** (`2.45` in this test), confirming the coverage-ratio check remains fully active for individual, byte-for-byte unaffected by this entire plan even though its *rates* are now intentionally editable.
- [x] All test rows cleaned up, 0 leftover.

**All 5 phases complete.** SME loans now use free-text rates (matching real per-account negotiation instead of one flat 3%/8% generic rate), individual loans get the same rate editability, borrower rate history pre-fills as a convenience default, SME's first payment date follows the client-confirmed +1-month rule, and Seafarer/individual's date and coverage behavior are provably untouched.

---

## Deferred (not in this plan — confirm separately before scoping)

- **Individual's first-payment-date rule** (MPL: end-of-month; Salary: 15th-and-end-of-month) — given by the
  user as "based on my understanding," not confirmed with the same rigor as SME's rule. Needs its own
  confirmation pass before implementing; until then `individual` keeps the Seafarer 22nd-cutoff rule (not
  because it's believed correct, but because no confirmed alternative exists yet).
- **Whether borrower rate history should pool `sme` and `individual` together** — flagged in Phase 3, not
  assumed. This plan defaults to per-segment scoping; confirm before Phase 3 implementation if pooling is
  actually wanted.
- **Borrower "reopen for negotiation" workflow** (decision #7 from the call): new borrower-dashboard button
  (visible only before check release), LRA notification, Committee vote re-opening. This is a substantially
  larger, separate feature touching borrower UI, LRA's queue, and `committee_votes`/`committee_actions` —
  flagged, not estimated or planned here.
- **Open items from the original SME extraction audit** (`docs/sme-calculator-extraction.md` §9) not
  touched by this plan: the `LA900039` admin-cost-base discrepancy, the `SME - SPECTRUM` rate conflict in
  the DB seed, and doc-stamp proration policy — none of these are resolved by moving to free-text rates.
- **`loanTypeId`'s label dropdown for `individual` still has no dedicated product to offer** (finding #15:
  `loan_types` has zero `segment = 'individual'` rows). Once this plan lands, individual loans will finally
  compute at the *correct, freely-typed rate* — but the loan-type **label** on generated documents will
  still show a borrowed Seafarer product name (e.g. "DIRECT") until someone adds a proper individual-segment
  `loan_types` row (or a differently-labeled fallback). Cosmetic, pre-existing, not worsened by this plan —
  flagged rather than silently expanded into scope.
