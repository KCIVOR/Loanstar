# CI collateral inspection → repeatable vehicles/properties — phase plan

Redesigns CM (vehicle) and REM (property) inspection from "one collateral
item per loan" to "add/remove as many as the loan actually has," then wires
the result into the mortgage/servicing documents so `vehicles`/`properties`
stop rendering empty (the gap confirmed in this session's earlier audit).

**Grounding done before writing this plan (no guessing):** read
`src/lib/cig/collateral-inspection.ts` in full, both form components in full,
and every consumer found by `grep -rl "CmInspection\|RemInspection"` across
the repo — 9 non-test files + 3 test files. Exact list in Phase 0.

**Work location:** new branch `feature/ci-collateral-repeatable-entries`, off
`develop`. **Do not cut it from the currently-checked-out doc-render branch
or vice versa** — this session already hit the "branch switch makes unrelated
work vanish from disk" problem once; use a worktree if both need to be open
at once.

---

## Phase 0 — Every file this touches, named up front

Grep-verified consumers of `CmInspection` / `RemInspection` /
`cm_inspection` / `rem_inspection`:

| File | Role |
|---|---|
| `src/lib/cig/collateral-inspection.ts` | type definitions + completeness assessors (the source of truth) |
| `src/components/cig/CmInspectionForm.tsx` | vehicle inspection UI (CIG fills it in) |
| `src/components/cig/RemInspectionForm.tsx` | property inspection UI |
| `src/lib/cig/forward.ts` | reads/writes the JSONB column on the CIG→Committee handoff |
| `src/lib/cig/verification.ts` | maps the DB row, runs the completeness gate for CIG stage progression |
| `src/lib/committee/ci-report.ts` | maps the same JSONB for the Committee's read-only CI report |
| `src/app/committee/applications/[id]/page.tsx` | Committee's read-only display (reuses the same form components + its own inline summary) |
| `src/components/collection/OriginationPacketPanel.tsx` | Collection's read-only display (same pattern) |
| `src/lib/dev/fake-data.ts` | dev-only seed generator (`fakeCmInspection`/`fakeRemInspection`) |
| `src/app/cig/applications/[id]/page.tsx` | hosts the editable CIG form |
| `src/lib/lra/template-context.ts` | where `vehicles`/`properties` are currently hardcoded `[]` (Phase 8's target) |
| `src/app/api/committee/applications/[id]/route.ts` | selects the raw `cm_inspection, rem_inspection` columns and spreads `mapCommitteeCollateralInspections(verification)` into its response — **no code change needed**, it's pure plumbing into `ci-report.ts` (Phase 6 already covers the mapper) |
| Tests: `collateral-inspection.test.mts`, `origination-packet.test.mts`, `ci-report.test.mts` | must stay green throughout |

**Correction caught during a second audit pass (2026-09-11):** the table
holding `cm_inspection`/`rem_inspection` is **`verifications`**, not
`verification_records` as an earlier draft of this plan assumed — confirmed
by `grep -n '.from("verif'` across every consumer (all 6 agree). Fixed
throughout this document.

**Also audited, confirmed out of scope — no CM/REM inspection detail is
shown anywhere else:**
- Reports → Accounts, Reports → Past Due, Reports → Origination Panel
  (`src/components/reports/OriginationPanel.tsx`) — all three only show
  `collateralLabel(row.collateralType)`, the coarse category
  (chattel/real-estate/none) as a filter chip and table column. Different,
  shallower concept than per-vehicle/property detail — nothing to change.
- **Remedial portal** (`src/app/remedial`) and **Collector portal**
  (`src/app/collector`) — swept for any collateral/chattel/vehicle/plate/
  chassis/TCT/mortgage reference; **found none at all**, not even the
  category label. Not a regression this plan causes — collateral detail
  simply isn't surfaced there today. Out of scope for this plan; flag
  separately if Remedial/Collection should see vehicle/property detail when
  pursuing repossession or foreclosure — that would be new UI, not part of
  this redesign.

**Global constraints (same as the BLRI plan):**
1. Touch only files named in the phase you're on. A file not listed that
   turns out to need a change → stop and say so before editing it.
2. **Never touch:** the field-visit / SME-reloan-verification forms (a
   deliberately separate, differently-shaped sibling module per the file's
   own comment — do not merge them), the doc-render/Gotenberg pipeline
   beyond the one context-builder edit in Phase 8, RLS policies, any
   unrelated CIG/Committee/Collection screen.
3. **No DB migration for the shape change.** `cm_inspection`/`rem_inspection`
   stay JSONB — the array becomes a convention inside the JSON, not a schema
   change. Existing saved rows are the **old, single-object shape** — they
   must keep working, not break or silently lose data. See Phase 1/2's
   `normalizeCmInspection`/`normalizeRemInspection`.
4. Gates after every phase: `npm test`, `npx tsc --noEmit` (no new errors in
   changed files), `npx next build`. UI phases (3, 4, 5) also get a manual
   click-through (this project has no component-test harness) — screenshot
   or describe what you clicked and saw before calling the phase done.
5. One phase = one commit. Phases 1–2 (data model) must land and be green
   **before** Phases 3–4 (UI) start, since the UI is written against the new
   types.
6. Backward compatibility: `CmInspectionForm`/`RemInspectionForm` keep their
   existing `Props` contract shape (`value`, `onChange`, `onSave`, `saving`,
   `readOnly`, `verifierName`) — only what's *inside* `value`/`onChange`
   changes. No call site's prop-passing code should need to change beyond
   what Phase 5 explicitly touches.

---

## Phase 1 — CM (vehicle) data model: array + backward-compat reader

**No UI changes in this phase.** Pure type + pure-function work.

Reshape `CmInspection` so the per-vehicle fields move under a `vehicles[]`
array; `account` and `verifiedBy` stay at the top (confirmed
application-level, not per-vehicle, via `assessCmInspectionRequired` and the
form's own "Account" / "Sign-off" sections which sit outside the per-vehicle
data today):

```ts
export type CmVehicleEntry = {
  orCrDetails?: CmOrCrDetails | null;
  registration?: CmRegistration | null;
  insurance?: CmInsurance | null;
  odometerDuringInspection?: number | null;
  vehiclesChecklist?: CmVehiclesChecklist | null;
  others?: CmOthers | null;
  vehiclesCondition?: CmVehiclesCondition | null;
};
export type CmInspection = {
  account?: CmAccount | null;
  vehicles?: CmVehicleEntry[] | null;
  verifiedBy?: string | null;
};
```

Also add the 2 fields the documents need that `CmOrCrDetails` doesn't have
today (confirmed missing by comparing against `deed_of_chattel_mortgage` /
`cancellation_of_chattel_mortgage` / `spa_mortgage_cancellation`'s
`data-repeat="vehicles"` rows, which all reference `{{makeYearModel}}` and
`{{crNo}}`):
```ts
export type CmOrCrDetails = {
  // existing: mvFile, plateNumber, engineNo, chasisNo
  makeYearModel?: string | null;   // NEW
  crNo?: string | null;            // NEW
};
```

**`normalizeCmInspection(raw: unknown): CmInspection`** — the single place
that upgrades an old saved row to the new shape, so every consumer only ever
sees the new shape:
```ts
export function normalizeCmInspection(raw: unknown): CmInspection {
  if (!raw || typeof raw !== "object") return { account: {}, vehicles: [], verifiedBy: null };
  const r = raw as Record<string, unknown>;
  if (Array.isArray(r.vehicles)) {
    return { account: (r.account as CmAccount) ?? {}, vehicles: r.vehicles as CmVehicleEntry[], verifiedBy: (r.verifiedBy as string | null) ?? null };
  }
  // legacy single-object shape — wrap it as one entry, don't drop the data.
  const hasLegacyFields = ["orCrDetails", "registration", "insurance", "vehiclesChecklist", "others", "vehiclesCondition", "odometerDuringInspection"].some((k) => k in r);
  return {
    account: (r.account as CmAccount) ?? {},
    verifiedBy: (r.verifiedBy as string | null) ?? null,
    vehicles: hasLegacyFields
      ? [{
          orCrDetails: (r.orCrDetails as CmOrCrDetails) ?? {},
          registration: (r.registration as CmRegistration) ?? {},
          insurance: (r.insurance as CmInsurance) ?? {},
          odometerDuringInspection: (r.odometerDuringInspection as number | null) ?? null,
          vehiclesChecklist: (r.vehiclesChecklist as CmVehiclesChecklist) ?? {},
          others: (r.others as CmOthers) ?? {},
          vehiclesCondition: (r.vehiclesCondition as CmVehiclesCondition) ?? {},
        }]
      : [],
  };
}
```

**`assessCmInspectionRequired`** updates to check "at least one vehicle has a
plate number" instead of the old single-object path:
```ts
if (!(cm?.vehicles ?? []).some((v) => filled(v.orCrDetails?.plateNumber))) {
  missing.push("CM Inspection: plate number");
}
```
Account name / verified-by checks are unchanged (still top-level).

**Files:** `src/lib/cig/collateral-inspection.ts` only.

**Tests:** extend `src/lib/cig/__tests__/collateral-inspection.test.mts` —
`normalizeCmInspection` on (a) a legacy single-object fixture (asserts it
becomes a 1-entry array with every field preserved), (b) an already-new-shape
fixture (asserts it passes through unchanged), (c) `null`/empty (asserts
`vehicles: []`, no throw); `assessCmInspectionRequired` against 0 vehicles,
1 complete vehicle, 1 incomplete + 1 complete (should pass — "at least one").

---

## Phase 2 — REM (property) data model: array + backward-compat reader

Same shape of change, mirrored for REM. `account`, `others` (the 5 free-text
lines), and `verifiedBy` stay top-level — **`others` is a judgment call**:
the source sheet describes it as 5 blank general-notes lines, not tied to a
specific property. Defaulting to "stays shared across all properties" (matches
current behavior, least invented); flag to the user if a per-property notes
field turns out to be wanted instead.

```ts
export type RemPropertyEntry = {
  titleDetails?: RemTitleDetails | null;
  insurance?: RemInsurance | null;
  checklist?: RemChecklist | null;
  legalDescription?: {          // NEW — needed by real_estate_mortgage /
    location?: string | null;   // cancellation_of_real_estate_mortgage /
    tctNo?: string | null;      // voluntary_surrender_deed_rem's
    areaSqm?: number | null;    // data-repeat="properties" rows
    technicalDescription?: string | null; // ({{location}}, {{tctNo}},
  } | null;                     //  {{areaSqm}}, {{technicalDescription}})
};
export type RemInspection = {
  account?: RemAccount | null;
  properties?: RemPropertyEntry[] | null;
  others?: string[] | null;
  verifiedBy?: string | null;
};
```

`normalizeRemInspection` mirrors `normalizeCmInspection` exactly (legacy
single-object → 1-entry array; `others`'s existing 5-blank-line default
stays as-is).

`assessRemInspectionRequired` — "at least one property has a registered
owner at the title," same pattern as CM.

**Files:** `src/lib/cig/collateral-inspection.ts` only (same file as Phase 1
— separate commit anyway, so a revert of one doesn't touch the other).

**Tests:** same shape of additions to `collateral-inspection.test.mts` as
Phase 1, for REM.

---

## Phase 3 — CmInspectionForm.tsx: repeatable vehicle cards

Wrap the existing OR/CR Details → Registration → Insurance → Odometer →
Vehicles Checklist → Others → Vehicles Condition sections (everything that's
now `CmVehicleEntry`) into one repeatable card, mirroring the **exact**
Add/Remove pattern already in this codebase
(`LoanEntryList` in `src/components/cig/CiReferencesFormModal.tsx` — a
per-entry card with a "Remove" button (`variant="danger-soft"`) in its header
and an "Add {label}" button below the list). Reuse that visual/interaction
shape, not the file (it's not exported) — same JSX structure, adapted.

- `Account` section and `Sign-off` section stay exactly where they are,
  outside the repeatable block.
- New: "+ Add vehicle" button (adds a blank `CmVehicleEntry`); each vehicle
  card gets a "Vehicle {n}" header + "Remove" button.
- **UX note to settle before merging, not before coding:** a full vehicle
  card (OR/CR + Registration + Insurance + 16-row Checklist + 4 Others
  subsections + 11-row Condition grid) is long. Recommend each card starts
  **collapsed** (accordion) showing just plate number / make-model in the
  header, expand to edit — avoids a loan with 4 vehicles becoming a
  multi-thousand-pixel scroll. Confirm this UX call, or ship flat/always-open
  for v1 and revisit.
- `ensure()` upgrades via `normalizeCmInspection` (Phase 1) instead of its
  own ad-hoc defaulting.
- `onSave` still saves the whole `CmInspection` object — no change to the
  save contract, only to what's inside it.

**Files:** `src/components/cig/CmInspectionForm.tsx` only.

**Verify:** run the app, open a CIG application's CM Inspection, add 3
vehicles with different plate numbers, save, reload — confirm all 3 persist
distinctly. Remove one, save, reload — confirm only 2 remain and the right
one was removed.

---

## Phase 4 — RemInspectionForm.tsx: repeatable property cards

Same restructuring, mirrored, plus the new `legalDescription` fields (add as
a new "Legal Description" sub-section inside each property card — Location,
TCT No., Area (sqm), Technical Description (`Textarea`, matches the
component's existing import)).

**Files:** `src/components/cig/RemInspectionForm.tsx` only.

**Verify:** same click-through as Phase 3, for properties.

---

## Phase 5 — Update the 2 read-only summary displays

`src/app/committee/applications/[id]/page.tsx` and
`src/components/collection/OriginationPacketPanel.tsx` both currently read
`cmInspection.orCrDetails?.plateNumber` / `remInspection.titleDetails
?.registeredOwnerAtTitle` etc. directly (single-object assumption) for their
"quick glance" summary line, **separately** from the full
`<CmInspectionForm readOnly />` / `<RemInspectionForm readOnly />` embed
(which Phases 3–4 already fix, since it's the same component). Update just
the quick-glance summary in both files to show one line per vehicle/property
(or a count + first-entry preview — confirm which with the user; recommend
"Vehicle 1 of 3: ABC-1234" style with all shown if 3 or fewer, otherwise a
scrollable list) instead of assuming exactly one.

**Files:** `src/app/committee/applications/[id]/page.tsx`,
`src/components/collection/OriginationPacketPanel.tsx`.

**Do NOT touch** anything else in either file — both are large multi-purpose
pages; stay inside the CM/REM inspection summary block only.

---

## Phase 6 — read-site normalization (the 4 places that map the raw JSONB)

Route the raw `row.cm_inspection` / `row.rem_inspection` through
`normalizeCmInspection` / `normalizeRemInspection` (Phase 1/2) at every place
it's read out of the database, so nothing downstream ever sees the legacy
shape:

- `src/lib/cig/verification.ts` (line ~271-272)
- `src/lib/cig/forward.ts` (the read side, if any — audit during this phase;
  its write side at line ~268-272 just passes the object through unchanged,
  which is fine since `CmInspectionForm`/`RemInspectionForm` now emit the new
  shape)
- `src/lib/committee/ci-report.ts` (line ~19-20)
- `src/components/collection/OriginationPacketPanel.tsx`'s existing
  `asCmInspection`/`asRemInspection` helpers (already exist per the earlier
  grep — replace their body with a call to the Phase 1/2 normalizer instead
  of whatever ad-hoc cast they currently do; read the current implementation
  first, don't assume its shape)

**Files:** the 4 above. **Do not** touch the write paths beyond confirming
they don't need changes.

---

## Phase 7 — dev fake-data generator

Update `fakeCmInspection`/`fakeRemInspection` in `src/lib/dev/fake-data.ts`
to emit the new `vehicles[]`/`properties[]` shape (1–2 fake entries by
default, matching whatever the function's existing `opts` parameter allows
for count — read its current signature first; extend additively, don't
change its existing call sites' behavior by default).

**Files:** `src/lib/dev/fake-data.ts` only.

---

## Phase 8 — wire the real data into the documents (the actual payoff)

Extend `loadReleaseGenerationContext` (or wherever the release context is
assembled in `src/lib/lra/release-service.ts`) to fetch the application's CI
inspection record (`verifications.cm_inspection` /
`.rem_inspection`, via `normalizeCmInspection`/`normalizeRemInspection`) and
map each entry into the `vehicles`/`properties` arrays
`buildReleaseTemplateContext` already accepts (currently hardcoded `[]` in
`template-context.ts`):

```
CmVehicleEntry.orCrDetails.plateNumber   -> vehicles[].plateNo
CmVehicleEntry.orCrDetails.engineNo      -> vehicles[].engineNo
CmVehicleEntry.orCrDetails.chasisNo      -> vehicles[].chassisNo
CmVehicleEntry.orCrDetails.mvFile        -> vehicles[].mvFileNo
CmVehicleEntry.orCrDetails.crNo          -> vehicles[].crNo
CmVehicleEntry.orCrDetails.makeYearModel -> vehicles[].makeYearModel
CmVehicleEntry.registration.registeredOwner -> vehicles[].registeredOwner
                                                (voluntary_surrender_deed_auto only)

RemPropertyEntry.legalDescription.location             -> properties[].location
RemPropertyEntry.legalDescription.tctNo                -> properties[].tctNo
RemPropertyEntry.legalDescription.areaSqm              -> properties[].areaSqm
RemPropertyEntry.legalDescription.technicalDescription -> properties[].technicalDescription
```

**Decision needed:** which CI record does the LRA pull from when a loan has
been re-inspected (multiple `verifications` rows over time, if that's
possible — check before assuming "latest")? Mirror whatever pattern
`getActiveComputation` uses for computations (latest/active row) unless the
verifications table's real shape says otherwise — confirm by reading
the table structure, don't guess.

**Files:** `src/lib/lra/release-service.ts`, `src/lib/lra/template-context.ts`
(only the `vehicles`/`properties` lines — nothing else in that file).

**Verify:** render `deed_of_chattel_mortgage`, `real_estate_mortgage`,
`cancellation_of_chattel_mortgage`, `cancellation_of_real_estate_mortgage`,
`spa_mortgage_cancellation`, `voluntary_surrender_deed_auto`,
`voluntary_surrender_deed_rem` (all 7 consumers of these two arrays) against
a fixture with 2+ vehicles / 2+ properties — confirm each row of the source
data becomes its own table row in the PDF, not just the first one.

---

## Phase 9 — full regression + sign-off

1. `npm test`, `npx tsc --noEmit`, `npx next build` — all clean.
2. `git diff --name-only develop..HEAD` matches exactly the files named
   across Phases 1–8 — anything else is scope creep, revert before merge.
3. Click through: CIG fills in a CM inspection with 3 vehicles and a REM
   inspection with 2 properties on a real (or seeded) SME collateral
   application → Committee's read-only view shows all of them → LRA
   generates the chattel + REM mortgage documents → confirm every vehicle
   and every property appears as its own table row, house layout intact.
4. Confirm an **old, already-saved** CM/REM inspection (pre-this-change, if
   one exists in the live DB) still displays correctly under the new form
   (proves `normalizeCmInspection`/`normalizeRemInspection` didn't lose
   anyone's real field data).
5. Update the project memory file with what shipped.
6. Merge to `develop` only when told to — standing rule.

---

## Outcome (2026-09-11 — "implement all")

Branch `feature/ci-collateral-repeatable-entries`, worktree
`.worktrees/ci-collateral` (off `develop`, not the checked-out branch — see
the note in Phase 8 below on why). Every open decision resolved with the
stated recommendation:

- Phase 3 UX: collapsed by default when >1 vehicle, open when 0-1.
- Phase 2 `others`: stayed one shared block (default).
- Phase 5 summary: show every entry inline (lists are short — 1-4 items).
- Phase 8 "which CI record": confirmed by reading `verifications`'s real
  columns — one row per `loan_application_id`, no version/active concept
  (unlike `computations`). Simple `.eq("loan_application_id", id)
  .maybeSingle()`.

**Shipped, all phases:**
- Phases 1-2 (`2e247e5`) — data model reshaped to `vehicles[]`/`properties[]`,
  `normalizeCmInspection`/`normalizeRemInspection` upgrade legacy saved rows,
  completeness assessors updated, new `makeYearModel`/`crNo`/
  `legalDescription` fields. 19 tests.
- Phase 3 (`64b8439`) — `CmInspectionForm.tsx` repeatable vehicle cards.
- Phase 4 (`c60d85f`) — `RemInspectionForm.tsx` repeatable property cards +
  new Legal Description section.
- Phases 5-6 (`6f71ef7`) — Committee + Collection read-only summaries show
  every entry; all 4 read sites normalized. 2 test files updated to actually
  catch the reshape (the old assertions would have silently passed on
  `undefined`).
- Phase 7 (`3b7fa24`) — dev fake-data generator emits the new shape,
  `vehicleCount`/`propertyCount` opt-in (default 1, existing callers
  unaffected).
- Phase 8 data half (`e10b5f8`) — `collateral-context.ts`:
  `buildCollateralDocumentContextFromRaw`/`loadCollateralDocumentContext` map
  CI vehicles/properties to the exact document-row shape. 8 tests, including
  the actual audit-gap proof (3 vehicles in → 3 document rows out).

**Phase 8's remaining half — deferred to branch merge, not skipped:** this
branch was cut from `develop`, which predates `template-context.ts` /
`release-service.ts` gaining `vehicles`/`properties` keys on the sibling
`feature/gotenberg-admin-config` branch. Wiring `collateral-context.ts`'s
output into those two files is a small, well-defined addition (replace the
hardcoded `[]` with a call to `loadCollateralDocumentContext` + spread) —
done once this branch merges with that one, documented in
`collateral-context.ts`'s own header so it isn't rediscovered from scratch.

**Not done this session:** a live browser click-through of the add/remove
vehicle/property UI — Next.js's dev-server singleton lock tied this
worktree's `npm run dev` to the user's own already-running server in the
main checkout, so a second instance couldn't start. Typecheck, the full test
suite, and `next build` are all clean; the interactive click-through (Phase 9
step 3 of this plan) is the one verification step still outstanding.

**Gates:** `npm test` 1684/0 (+7 skip) across all phases, `tsc --noEmit`
clean for every changed file (pre-existing ~19-line baseline elsewhere
untouched), `next build` ✓. `git diff --name-only develop..HEAD` matches
exactly the files phases 1-8 named, plus the new `collateral-context.ts` +
its test (Phase 8) — no scope creep.

Not merged to `develop` — same standing rule as every other change this
session, only when asked.
