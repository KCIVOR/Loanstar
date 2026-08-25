# Concurrent Loan Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user runs **one phase at a time** and reviews the summary before the next phase starts.

**Goal:** Let one borrower account hold more than one live loan account at the same time — apply again while an existing loan is being paid, and disburse a second masterlist account — without allowing two originations in flight on the same login.

**Architecture:** Postgres already allows many `loan_applications` per `borrower_id`. Do not add a unique constraint. Change the borrower eligibility gate so servicing statuses (`loan_active` / `released` / `closed`) no longer block a new apply. Keep one origination file at a time. Tag a true payoff-then-apply as `is_reloan`; tag a parallel product as `is_reloan=false`. Staff queues stay application-centric (already safe). Borrower home becomes a list of loan accounts plus at most one in-process application.

**Tech Stack:** Next.js App Router, existing UI kit, Supabase, node:test (`.mts`). **No Postgres migration.**

---

**Ground rules (every phase):**
- Closed **Allow** / **Do not touch**. If another file is required, stop and flag before editing it.
- After each phase, `git diff --stat` — every changed path must be on that phase's Allow list.
- Do not commit unless the user explicitly asks.
- Run the tests named in the phase. `npx tsc --noEmit` no worse than known pre-existing test-file errors.
- One phase at a time. Do not start Phase N+1 until Phase N Verify passes.

---

## Locked product decisions (from the 2026-08-21 audit)

These are not open questions. Do not reopen them in implementation.

| # | Decision |
|---|---|
| 1 | **Multiple loan accounts** (audit option B), which includes applying while a loan is active (option A). |
| 2 | **Not** two originations at once (audit option C). `submitted` / `for_verification` / `for_approval` / LRA statuses still block a new apply. |
| 3 | Resume a leftover `draft` instead of creating a second draft (keep `findResumableDraft`). |
| 4 | A new file opened while any servicing account exists is **parallel**, `is_reloan = false`. CIG must not use SME reloan verification for it. |
| 5 | A new file opened when every prior app is `paid_off` / `denied` / `cancelled` stays a **reloan**, `is_reloan = true` (today's behavior). |
| 6 | **No profile snapshot** in this plan. Application form still writes the shared `borrowers` row. Call that out in CSA warning copy. |
| 7 | CSA **warns** when the email already has an active loan or an in-process file. CSA does **not** hard-block create (staff already do this in live data). |
| 8 | Coverage that is actually enforced today (`skipCoverageForSegment` is **`segment === "sme"` only**) must include other active masterlist monthly amortizations. That is **Seafarer and Individual**. SME still skips the endorse block. Show the other-loan totals as a warning on **all** segments. |
| 9 | No new unique index. No change to CIG/Committee/LRA/AR posting engines. Collector already lists one card per masterlist row. |

### Status buckets (lock these names in code)

```ts
/** Finished — do not block a new apply. Count as history. */
RELOAN_TERMINAL_STATUSES = ["paid_off", "denied", "cancelled"]

/** Live or recently disbursed loan accounts — do not block a new apply. */
SERVICING_STATUSES = ["released", "closed", "loan_active"]

/** Everything else is origination and blocks a new apply (except resumable draft). */
```

`nextApplicationKind` returns:

- `first` — no applications at all
- `reloan` — eligibility ok, history exists, **no** servicing statuses
- `additional` — eligibility ok, at least one servicing status
- `null` — origination in flight (after draft-resume is handled)

### Live evidence (do not "fix" these rows in this plan)

Borrower `5c2e052a-…` already has `AN300002` `loan_active` plus two `submitted` files created by CSA. After this plan, the borrower still cannot self-start a third origination until those `submitted` files leave origination. Staff can still open another file with a warning.

---

## Hard constraints

### Never modify
1. Existing migration files.
2. `src/lib/computation/sf.ts` or `src/lib/computation/sme.ts` math.
3. Seafarer application-form completeness `missing[]` (byte-identical).
4. CIG sequence / CM / REM inspection (collateral is orthogonal).

### Do not build in this plan
- Per-application copied profile / `business_info` snapshot.
- Two in-flight CSA/CIG files from the borrower portal.
- A DB trigger that forbids two `loan_active` rows (that is the opposite of this plan).
- New SME affordability policy beyond the existing-obligation **warning**.

---

## File map

| File | Role |
|---|---|
| `src/lib/borrowers/reloan.ts` | Eligibility + kind (`first` / `reloan` / `additional`) |
| `src/lib/borrowers/__tests__/reloan.test.mts` | Freeze the new gate |
| `src/app/api/borrower/applications/reloan/route.ts` | `is_reloan` only when kind is `reloan` |
| `src/lib/borrowers/home.ts` | Stop exclusive `active_loan` mode from hiding a pipeline file |
| `src/app/borrower/page.tsx` | List loan accounts + one pipeline + Start another |
| `src/app/api/borrower/applications/route.ts` | Attach a small loan-account summary per servicing app |
| `src/lib/csa/create-application.ts` | Snapshot existing files for an email (warn, don't block) |
| `src/app/api/csa/borrowers/existing/route.ts` | GET lookup by email |
| `src/app/csa/applications/new/page.tsx` | Warning banner before submit |
| `src/lib/borrowers/existing-obligations.ts` | Pure sum of other active masterlist amorts |
| `src/lib/csa/sme-duplication.ts` | Same-account applications count as matches |
| `src/lib/csa/computation.ts` | Seafarer **and Individual** coverage use this amort + other active amorts; SME still skips the endorse block |
| `src/lib/csa/application.ts` | Endorse still uses stored coverage; no extra checklist gate |

**Plan review (2026-08-21):** product rule is correct. The findings below are already inlined in the phases.

| Finding | Severity | Correction |
|---|---|---|
| `masterlist.monthly_amortization` exists (numeric) | Info | Use it. |
| `skipCoverageForSegment` is SME-only, not Individual | High | Combined amort applies to Seafarer and Individual. |
| `persistComputation` field is `loanApplicationId` | High | Never use `input.applicationId`. |
| `home.test.mts` already asserts `active_loan` wins | High | Rewrite that test. |
| Start button hidden when `loan && !fullyPaid` | High | Phase 2 adds Start outside EmptyState. |
| `handleStartClick` only prefills on `reloan` | High | Prefill `additional` from latest servicing app. |

---

## Phase 1 — Eligibility: servicing does not block a new apply

**Allow:**
- `src/lib/borrowers/reloan.ts`
- `src/lib/borrowers/__tests__/reloan.test.mts`
- `src/app/api/borrower/applications/reloan/route.ts`

**Do not touch:** borrower home UI, CSA create, computation.

### Current bug vs the product

`canStartReloan` treats `loan_active` as "ongoing application" and returns 400. Tests freeze that. Those tests must change — they encoded the old product rule.

### Task 1.1 — Failing tests for the new gate

- [ ] **Step 1: Rewrite the `loan_active` case and add `additional` kind tests** in `src/lib/borrowers/__tests__/reloan.test.mts`.

Replace the existing `canStartReloan rejects when loan_active app exists` test with:

```ts
test("canStartReloan allows when the only open file is loan_active", () => {
  assert.deepEqual(
    canStartReloan({ applicationStatuses: ["loan_active"] }),
    { ok: true },
  );
});

test("canStartReloan allows loan_active plus paid_off history", () => {
  assert.deepEqual(
    canStartReloan({
      applicationStatuses: ["paid_off", "loan_active"],
    }),
    { ok: true },
  );
});

test("canStartReloan allows released and closed (servicing, not origination)", () => {
  assert.deepEqual(
    canStartReloan({ applicationStatuses: ["released"] }),
    { ok: true },
  );
  assert.deepEqual(
    canStartReloan({ applicationStatuses: ["closed", "loan_active"] }),
    { ok: true },
  );
});

test("canStartReloan still rejects a submitted file even with an active loan", () => {
  const result = canStartReloan({
    applicationStatuses: ["loan_active", "submitted"],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /in process/i);
  }
});

test("nextApplicationKind is additional when a servicing account exists", () => {
  assert.equal(
    nextApplicationKind({ applicationStatuses: ["loan_active"] }),
    "additional",
  );
});
```

Keep the existing `nextApplicationKind is reloan when only terminal apps exist` test (already in the file). Keep the existing `documents_pending` reject test. Change **both** reject matchers to `/in process/i` to match the locked reason string.

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx tsx --test src/lib/borrowers/__tests__/reloan.test.mts
```

Expected: `loan_active` allow tests fail (current code rejects).

### Task 1.2 — Implement the gate

- [ ] **Step 3: Update `src/lib/borrowers/reloan.ts`**

Keep `RELOAN_TERMINAL_STATUSES`. Add:

```ts
export const SERVICING_STATUSES = [
  "released",
  "closed",
  "loan_active",
] as const;

export type NextApplicationKind = "first" | "reloan" | "additional";

export function isOriginationStatus(status: string): boolean {
  if ((RELOAN_TERMINAL_STATUSES as readonly string[]).includes(status)) {
    return false;
  }
  if ((SERVICING_STATUSES as readonly string[]).includes(status)) {
    return false;
  }
  return true;
}
```

Change `canStartReloan` to filter with `isOriginationStatus`. New reason (lock this string):

`"You already have an application in process. Finish or wait for it to close before starting another."`

Change `nextApplicationKind`:

```ts
export function nextApplicationKind(input: {
  applicationStatuses: string[];
}): NextApplicationKind | null {
  if (!canStartReloan(input).ok) return null;
  if (input.applicationStatuses.length === 0) return "first";
  const hasServicing = input.applicationStatuses.some((status) =>
    (SERVICING_STATUSES as readonly string[]).includes(status),
  );
  return hasServicing ? "additional" : "reloan";
}
```

Do not change `findResumableDraft`. Do not widen `resolveBorrowerCreateSegment`'s `kind` union — the POST route already maps `kind === "reloan" ? "reloan" : "first"` into that helper (line 118–119 today). `additional` correctly goes through the `"first"` branch **when the picker sends `bodySegment`**. That is why Phase 2 must open the picker for `additional` with servicing prefill; an empty-body additional POST would silently create Seafarer.

- [ ] **Step 4: Wire the reloan POST route**

In `src/app/api/borrower/applications/reloan/route.ts`, after `const kind = nextApplicationKind(...)`:

```ts
const isReloan = kind === "reloan";
```

`kind === "additional"` and `kind === "first"` both insert `is_reloan: false`.

`kind` can be null only if eligibility failed — that path already 400s before this line. Add a 500-safe guard:

```ts
if (!kind) {
  return NextResponse.json(
    { error: eligibility.reason },
    { status: 400 },
  );
}
```

Keep `parent_application_id: isReloan ? (latestApp?.id ?? null) : null`. Parallel additional loans have **no** parent. (If product later wants a link, that is a new column/plan.)

- [ ] **Step 5: Re-run tests — expect PASS**

```bash
npx tsx --test src/lib/borrowers/__tests__/reloan.test.mts
```

Expected: all pass.

**Verify (API, not UI):**
- Borrower with only `loan_active` can POST `/api/borrower/applications/reloan` **with a segment body** and get a new `draft` with `is_reloan: false`.
- Borrower with `submitted` still gets 400.
- Borrower with only `paid_off` still gets `is_reloan: true`.
- **Do not expect the borrower home Start button to work yet.** It is hidden while an unpaid loan exists (`loan && !fullyPaid ? null : EmptyState`). That is Phase 2.

---

## Phase 2 — Borrower home: list of loan accounts

**Allow:**
- `src/lib/borrowers/home.ts`
- `src/lib/borrowers/__tests__/home.test.mts` (create if missing; if the file does not exist, add it)
- `src/app/api/borrower/applications/route.ts`
- `src/app/borrower/page.tsx`

**Do not touch:** eligibility (Phase 1), CSA, computation.

### Task 2.1 — Home mode is not exclusive

Today `borrowerHomeMode` returns `active_loan` whenever any loan summary exists, which hides "you also have an application in process."

The file **already exists**. It currently asserts `"active_loan wins when loan exists"` for `{ hasOpenApplication: true, hasActiveLoan: true }` → `"active_loan"`. That test **must be rewritten**. Adding a second test without changing it will fail.

- [ ] **Step 1: Change the existing mode tests** in `src/lib/borrowers/__tests__/home.test.mts`:

```ts
it("active_and_applying when loan and in-process application both exist", () => {
  assert.equal(
    borrowerHomeMode({ hasOpenApplication: true, hasActiveLoan: true }),
    "active_and_applying",
  );
});

it("active_loan when loan exists and no in-process application", () => {
  assert.equal(
    borrowerHomeMode({ hasOpenApplication: false, hasActiveLoan: true }),
    "active_loan",
  );
});
```

Also extend `borrowerHomeDescription` tests to cover `"active_and_applying"`.

- [ ] **Step 2: Run — expect FAIL** (`active_and_applying` not in the union).

- [ ] **Step 3: Update `borrowerHomeMode`**

```ts
export type BorrowerHomeMode =
  | "ready"
  | "in_progress"
  | "active_loan"
  | "active_and_applying";

export function borrowerHomeMode(input: {
  hasOpenApplication: boolean;
  hasActiveLoan: boolean;
}): BorrowerHomeMode {
  if (input.hasActiveLoan && input.hasOpenApplication) {
    return "active_and_applying";
  }
  if (input.hasActiveLoan) return "active_loan";
  if (input.hasOpenApplication) return "in_progress";
  return "ready";
}
```

Update `borrowerHomeDescription` for `active_and_applying`:

`"You have an active loan and a new application in process. Open either file below."`

- [ ] **Step 4: Tests pass.**

### Task 2.2 — Applications list carries loan-account summaries

- [ ] **Step 5: Extend GET `/api/borrower/applications`**

After loading applications, if any ids exist, also select masterlist:

```ts
const { data: masterlistRows } = applicationIds.length
  ? await supabase
      .from("masterlist")
      .select(
        "loan_application_id, outstanding_balance, monthly_amortization, account_status, loan_account_no",
      )
      .in("loan_application_id", applicationIds)
  : { data: [] };
```

Map onto each application:

```ts
loanAccount: masterlist
  ? {
      outstanding: Number(masterlist.outstanding_balance ?? 0),
      monthly: Number(masterlist.monthly_amortization ?? 0),
      accountStatus: String(masterlist.account_status),
      loanAccountNo: (masterlist.loan_account_no as string | null) ?? null,
    }
  : null,
```

Live DB (2026-08-21): `masterlist.monthly_amortization` is `numeric`. Select it. Do not omit it.

### Task 2.3 — Home UI lists every servicing account

- [ ] **Step 6: On `src/app/borrower/page.tsx`**

Import `SERVICING_STATUSES` from `@/lib/borrowers/reloan`.

**Start button (required, not optional):** today the only Start control is inside:

```tsx
{pipelineApp ? (
  /* progress card */
) : loan && !fullyPaid ? null : (
  <EmptyState action={canStart.ok ? <Button onClick={handleStartClick}>…</Button> : undefined} />
)}
```

After Phase 1, `canStart.ok` is true for an unpaid `loan_active` borrower, but this JSX still renders `null`. Put an **Apply for another loan** button on the Your loans section (and/or the header) whenever `canStart.ok && !pipelineApp`. Keep EmptyState only for the no-loan, no-pipeline case.

**Segment picker prefill:** change `handleStartClick` so both `reloan` and `additional` prefill from the latest **servicing** application (not `applications[0]`, which might be a newer cancelled row). `first` still defaults to Seafarer.

```ts
function handleStartClick() {
  if (appKind === "reloan" || appKind === "additional") {
    const latestServicing =
      applications.find((a) =>
        (SERVICING_STATUSES as readonly string[]).includes(a.status),
      ) ?? applications[0];
    const segment =
      latestServicing?.segment === "sme" ||
      latestServicing?.segment === "individual"
        ? latestServicing.segment
        : "seafarer";
    setPickerSegment(segment);
    setPickerEntityType(
      segment === "sme"
        ? latestServicing?.entityType === "corporate"
          ? "corporate"
          : "individual"
        : "individual",
    );
    setPickerCollateralType("none");
  } else {
    setPickerSegment("seafarer");
    setPickerEntityType("individual");
    setPickerCollateralType("none");
  }
  setShowSegmentPicker(true);
}
```

Replace the single `loan` state fetch with:

```ts
const loanAccounts = applications.filter((a) =>
  (SERVICING_STATUSES as readonly string[]).includes(a.status),
);
```

Use `application.loanAccount` from the list payload instead of N extra `/loan` fetches for the home cards. Keep the existing `/loan` fetch **only** if a card still needs next-due date and the list payload does not have it. Prefer one extra batched select of `amortization_schedules` in the applications GET (next unpaid installment per masterlist) if next-due is already shown on home. If that balloons the route, ship cards with outstanding + status only; next-due stays on the detail page. **Lock for this phase: outstanding + account status + link. Next-due can stay on the detail page.**

Home layout (stacked, not exclusive):

1. **Your loans** — one compact card per `loanAccounts` row: application no. / loan account no., status, outstanding, button to `/borrower/applications/:id`.
2. **Application in process** — keep the existing `pipelineApp` progress card when present.
3. **Start another loan** — show the existing start button when `canStart.ok` is true. Label: `appKind === "additional" ? "Apply for another loan" : appKind === "reloan" ? "Apply for reloan" : "Start application"`.
4. History table: exclude **all** servicing + pipeline ids, not only `application.id`. Today `historySource` drops a single `application`, which can hide the other live file. Fix:

```ts
const liveIds = new Set(
  [...loanAccounts, pipelineApp].filter(Boolean).map((a) => a!.id),
);
const historySource = applications.filter((app) => !liveIds.has(app.id));
```

KPI row: "Current application" may stay as the pipeline status. "No active loan" hint becomes `"N loan accounts"` when `loanAccounts.length !== 1`.

Do not remove `LoanActivePanel` from the application detail page.

**Verify:**
- Account with one `loan_active` and no pipeline: home shows one loan card + Start another loan.
- Account with `loan_active` + `draft` (after Phase 1): home shows loan card + pipeline card. Mode description is `active_and_applying`.
- Two `loan_active` (after a second disbursement): two loan cards. History does not list them.

---

## Phase 3 — CSA create: warn, do not block

**Allow:**
- `src/lib/csa/create-application.ts`
- `src/app/api/csa/borrowers/existing/route.ts` (create)
- `src/app/csa/applications/new/page.tsx`
- `src/lib/csa/__tests__/create-application-existing.test.mts` (create; pure helper only)

**Do not touch:** borrower portal, computation.

### Task 3.1 — Pure classifier for the warning

- [ ] **Step 1: Add `classifyExistingApplications` in `create-application.ts`** (keep `createCsaApplication` in the same file).

```ts
export type ExistingApplicationLite = {
  applicationNo: string | null;
  status: string;
  segment: string | null;
};

export function classifyExistingApplications(apps: ExistingApplicationLite[]): {
  servicing: ExistingApplicationLite[];
  origination: ExistingApplicationLite[];
} {
  const servicing: ExistingApplicationLite[] = [];
  const origination: ExistingApplicationLite[] = [];
  for (const app of apps) {
    if ((SERVICING_STATUSES as readonly string[]).includes(app.status)) {
      servicing.push(app);
    } else if (isOriginationStatus(app.status)) {
      origination.push(app);
    }
  }
  return { servicing, origination };
}
```

Import `SERVICING_STATUSES` and `isOriginationStatus` from `@/lib/borrowers/reloan`.

Test: servicing `loan_active` vs origination `submitted` vs ignore `paid_off`.

- [ ] **Step 2: GET `/api/csa/borrowers/existing?email=`**

Permission: `intake` `view`. Lookup `borrowers` by `lower(email)`. If none, `{ exists: false, servicing: [], origination: [] }`. If found, select that borrower's applications (`application_no, status, segment`), classify, return.

- [ ] **Step 3: CSA new application page**

On email blur (and before submit), fetch that GET. If `servicing` or `origination` is non-empty, show an `Alert variant="warning"` listing application numbers and statuses. Copy:

`"This email already has [N] active loan account(s) and [M] application(s) in process. Creating another file is allowed. The borrower profile is shared — saving the form on the new file overwrites the same name and business info."`

Submit still calls the existing create POST. Do not add a confirm modal unless the warning is easy to miss; the Alert above the button is enough.

**Verify:** Type a live borrower email that has `loan_active` (use a non-production email in staging). Warning appears. Submit still creates a `submitted` application.

---

## Phase 4 — Same-account visibility for credit staff

**Allow:**
- `src/lib/borrowers/existing-obligations.ts` (create)
- `src/lib/borrowers/__tests__/existing-obligations.test.mts` (create)
- `src/lib/csa/sme-duplication.ts`
- `src/lib/csa/__tests__/sme-duplication.test.mts`
- `src/lib/csa/computation.ts`
- `src/app/csa/applications/[id]/page.tsx` (warning banner only — if the computation panel is a child component, that child instead; do not restyle the page)

**Do not touch:** `sf.ts` / `sme.ts`, endorse checklist, CIG.

### Task 4.1 — Existing obligations helper (pure)

- [ ] **Step 1: Failing tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { sumActiveObligations } from "../existing-obligations";

test("sums other active accounts and skips the current application", () => {
  const result = sumActiveObligations(
    [
      {
        loanApplicationId: "a",
        accountStatus: "active",
        monthlyAmortization: 5000,
        outstanding: 80000,
      },
      {
        loanApplicationId: "b",
        accountStatus: "active",
        monthlyAmortization: 3000,
        outstanding: 40000,
      },
      {
        loanApplicationId: "c",
        accountStatus: "paid",
        monthlyAmortization: 2000,
        outstanding: 0,
      },
    ],
    "b",
  );
  assert.equal(result.otherMonthlyAmortization, 5000);
  assert.equal(result.otherOutstanding, 80000);
  assert.equal(result.otherActiveCount, 1);
});
```

- [ ] **Step 2: Implement**

```ts
export type ObligationRow = {
  loanApplicationId: string;
  accountStatus: string;
  monthlyAmortization: number;
  outstanding: number;
};

export function sumActiveObligations(
  rows: ObligationRow[],
  excludeApplicationId: string,
): {
  otherMonthlyAmortization: number;
  otherOutstanding: number;
  otherActiveCount: number;
} {
  let otherMonthlyAmortization = 0;
  let otherOutstanding = 0;
  let otherActiveCount = 0;
  for (const row of rows) {
    if (row.loanApplicationId === excludeApplicationId) continue;
    if (row.accountStatus !== "active") continue;
    otherMonthlyAmortization += row.monthlyAmortization;
    otherOutstanding += row.outstanding;
    otherActiveCount += 1;
  }
  return { otherMonthlyAmortization, otherOutstanding, otherActiveCount };
}
```

Add `loadActiveObligations(supabase, borrowerId)` that selects masterlist for that borrower (`loan_application_id, account_status, monthly_amortization, outstanding_balance`). Map into `ObligationRow`. If `monthly_amortization` is missing on the table, use `0` for monthly and still sum outstanding.

### Task 4.2 — Same-account duplication matches

- [ ] **Step 3: In `findSmeDuplicationMatches`, after loading the current app**, query `loan_applications` for `borrower_id = current` and `id != applicationId`. Push each as:

```ts
push({
  source: "borrower",
  id: app.borrower_id as string,
  companyName,
  ownerName,
  applicationId: other.id,
  applicationNo: other.application_no,
});
```

Keep the existing `neq("id", current borrower)` search for **other people**. Same-account files are an extra loop, not a replacement.

Add a unit test only if you extract a pure `mergeSameAccountMatches` helper. Do not mock Supabase in this phase if the file has no query mocks today — a 5-line pure merge helper is enough to test.

### Task 4.3 — Computation uses other amorts (Seafarer and Individual)

- [ ] **Step 4: In `persistComputation`**, load masterlist rows for this application's `borrower_id` (select `borrower_id` from `loan_applications` where `id = input.loanApplicationId` if it is not already on the input). Then:

```ts
const obligations = sumActiveObligations(rows, input.loanApplicationId);
```

SME/Individual: SME still skips the coverage **block** via `skipCoverageForSegment`. Individual does **not** skip — combined amort is included in the 35% ratio, same as Seafarer. Show the banner on all three segments.

**Verify:**
- Seafarer with an existing ₱5,000 amort + new ₱8,000 amort and ₱20,000 income → ratio uses 13,000/20,000.
- Individual with an existing ₱5,000 amort + new ₱8,000 amort and ₱20,000 income → same 13,000/20,000 ratio (Individual is **not** skipped).
- SME with an existing amort → endorse still not blocked by coverage; banner visible.
- SME duplication panel lists the borrower's other application numbers.

---

## Phase 5 — Copy, labels, and regression sweep

**Allow:**
- `src/app/borrower/page.tsx` (button label leftover only)
- `src/app/csa/applications/[id]/page.tsx` (banner leftover only)
- `src/lib/borrowers/home.ts` (description leftover only)
- Test files from Phases 1–4 if a matcher needs tightening

**Do not add features.**

- [ ] Confirm Start button labels: first / reloan / additional.
- [ ] Confirm history table never lists a `loan_active` row that also appears under Your loans.
- [ ] Confirm CIG still uses field visit (not SME reloan verification) when `is_reloan` is false on a parallel SME file.
- [ ] Run:

```bash
npx tsx --test src/lib/borrowers/__tests__/reloan.test.mts src/lib/borrowers/__tests__/home.test.mts src/lib/borrowers/__tests__/existing-obligations.test.mts src/lib/csa/__tests__/sme-duplication.test.mts
npx tsc --noEmit
```

- [ ] `git diff --stat` — no files outside Phases 1–5 allow lists.

---

## Out of scope (explicit)

| Item | Why |
|---|---|
| Profile snapshot per application | Audit option C. Shared `borrowers` row stays. CSA warning is the mitigation. |
| Borrower starting two originations | Still blocked. |
| Collector / AR engine changes | Already one card per masterlist. |
| Reports borrowers view | Already sums per person. |
| Linking `parent_application_id` on additional loans | Avoid fake reloan semantics. |
| Unique index "one loan_active per borrower" | Would forbid the feature. |

---

## Execution notes

- **No migration.** If Phase 2 discovers `masterlist` has no monthly column, outstanding-only cards are the fallback — document it in the phase Result, do not invent a column.
- **Do not commit** unless the user asks.
- After each phase, post a Result block: files changed, tests run, deviations, how to click-test.

---

## Phase completion report (required)

```
**Result (YYYY-MM-DD):**
- **Files changed:** path — one line each
- **Migrations:** none
- **Tests:** command + pass/fail
- **Deviations:** or "none"
- **Verify:** the click-test in that phase
```
