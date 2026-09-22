# UAT demo-data seed plan

**Written:** 2026-09-22 · **Status:** PLAN ONLY — nothing seeded yet.
**Purpose:** every one of the 110 test cases in `Loanstar-System-UAT-POL006.docx` needs a real record on screen that matches its Starting Condition / Test Data fields. This plan says which of those already exist in the live database, and exactly what's missing.

**⚠️ There is no staging project.** `list_projects` returns exactly one active Supabase project (`acopcwlhkovssjnrqygk`, "Loanstar") — this is the same database every live audit and every screenshot in this session has been reading from. There is no isolated environment to seed into. §5 is the safety mechanism that makes seeding into it survivable.

---

## 1. What already exists (verified 2026-09-22, no seeding needed)

Pulled directly from the live DB, not assumed:

| Area | Confirmed state |
|---|---|
| Staff role accounts | All 11 `@loanstar.local` accounts exist with the correct role: `super_admin`, `agent`, `csa`, `cig`, `committee`, `lra`, `ar`, `collector`, `collection_head`, `remedial`. `borrower@loanstar.local` also exists. **No new accounts needed.** |
| Application statuses | Most of the lifecycle is populated: `draft`, `submitted`, `for_verification`, `for_approval`, `approved`, `denied`, `awaiting_confirmation`, `release_signing`, `release_ready`, `loan_active`, `paid_off`, `cancelled` all have rows across Seafarer/SME/Individual. |
| CM Inspection (multi-vehicle) | **Already has real 3-vehicle data** on 2 SME loans (`c21da252…`, `8bd908c6…`, both `release_signing`). UAT-105 is already demonstrable as a *view*, just not as a live *add* (see §2). |
| Masterlist / AR aging | All five aging buckets populated (`current` 48, `1-30` 16, `31-60` 5, `61-90` 3, `91+` 10). `remedial_flag` both true (10) and false (72). Covers UAT-051/052/053. |
| Remedial | 8 `remedial`-status accounts, including rows in the `91+` bucket. Covers UAT-064/065 provided the "Critical" tier is computed from days-past-due (not stored) — I did not read that threshold in this pass, flagged in §4. |
| Agent leads | 48 `open`, 16 `converted`. Covers UAT-018/020/021/023. Pipeline-stage chips (UAT-019, "Awaiting link"/"Gathering docs"/"Docs ready") are computed from document checklist state, not a stored column — not independently verified this pass. |
| DCR | 117 `reconciled`, 6 `rejected`. Covers UAT-055/056 as history. **No DCR is currently in a pre-reconciliation state** — gap, see §2. |
| Individual legacy CI data | 18 pre-switch Individual applications hold `pic_verification` with no `field_visit` — **exactly what UAT-104 needs**, already live. Pick any one, e.g. application `9327545a-…` (`paid_off`, has_pic=true, has_fv=false). |

---

## 2. Real gaps — new data needed

Nine gaps, each blocking specific test cases. All nine are additive (new rows), none require touching an existing record.

| # | Gap | Blocks | What to create |
|---|---|---|---|
| G1 | No application in `on_hold` | UAT-026, UAT-027 (place/clear CSA hold) | 1 SME or Seafarer app in `submitted`, held with reason text |
| G2 | No application in `committee_hold` | UAT-040 | 1 app in `for_approval`, moved to Committee hold |
| G3 | No application in `negotiating_terms` | UAT-041 | 1 app in `for_approval` with a counter-offer negotiation record |
| G4 | No application in `for_revision` | (implicit — `cigNextStep`'s `for_revision` branch, referenced in CIG workspace copy, not directly a numbered UAT case but worth having live) | 1 app returned from Committee to CIG or CSA with a revisit reason |
| G5 | No application in `lra_pending` | UAT-046 | 1 approved app not yet started in LRA |
| G6 | No application in `release_briefing` | UAT-049, UAT-050 | 1 Seafarer app past signing, awaiting pre-departure briefing |
| G7 | **Zero REM Inspection data exists anywhere** — all 4 real-estate-collateral apps show 0 properties | UAT-107, UAT-108 | 1 SME **or** Individual app, `real_estate` collateral, in `for_verification`, with a live editable REM Inspection to add 2 properties to |
| G8 | No collateral app currently *in CIG* (editable) with room to add vehicles/properties live | UAT-105, UAT-106, UAT-098–103 combined | 1 SME app, `car_refinancing`, `for_verification`, empty/partial CM Inspection |
| G8b | **Individual + collateral has never been exercised together** — the 2 existing Individual collateral apps both have 0 vehicles/properties and `has_fv=false` | UAT-097, UAT-100–103 combined with collateral | 1 **new** Individual app, `car_refinancing`, `for_verification`, so a tester can walk intake → CIG Field Visit → CM Inspection add/remove in one continuous Individual demo account |
| G9 | No DCR in a pre-reconciliation state | UAT-055, UAT-060 | 1 `submitted` (unreconciled) DCR with 2–3 line items |

**Net new rows:** 9 loan applications (one per gap, G8b's Individual app can double as G7's if it's given real_estate instead of car_refinancing collateral — see §3 for the exact combined list), their attendant `verifications`/`computations`/`application_details` rows, 1 DCR with items, and status-transition audit rows so history views aren't empty either.

---

## 3. Exact seed list (what Cursor implements)

Collapsing G1–G9 into the minimum number of new applications, each one deliberately built to unlock as many gaps as it can:

| New record | Segment | Status | Collateral | Purpose (unlocks) |
|---|---|---|---|---|
| Demo App 1 | SME | `submitted`, then held | none | G1 — UAT-026, UAT-027 |
| Demo App 2 | Seafarer | `for_approval`, then Committee hold | none | G2 — UAT-040 |
| Demo App 3 | SME | `for_approval`, then negotiating | none | G3 — UAT-041 |
| Demo App 4 | Seafarer | `for_revision` (returned from Committee) | none | G4 |
| Demo App 5 | SME | `lra_pending` | none | G5 — UAT-046 |
| Demo App 6 | Seafarer | `release_briefing` | none | G6 — UAT-049, UAT-050 |
| Demo App 7 | SME | `for_verification`, empty CM Inspection | `car_refinancing` | G8 — UAT-105, UAT-106, UAT-098, UAT-099 |
| Demo App 8 | **Individual** | `for_verification`, no verification data at all | `real_estate` | G7 + G8b combined — UAT-100, UAT-101, UAT-102, UAT-103, UAT-107, UAT-108. This one application walks CIG Field Visit *and* REM Inspection *and* Individual+collateral in one seat. |
| Demo App 9 | Individual | `draft` (freshly started, untouched) | `car_refinancing` | UAT-097 itself — "start a new Individual application," so the intake flow is demoed live, not pre-seeded past it |
| Demo DCR | — | `submitted` | — | G9 — UAT-055, UAT-060, tied to an existing `loan_active` account from an existing collector-assigned borrower |

That's **9 applications + 1 DCR** — small, deliberate, not a bulk re-seed.

---

## 4. Two things to verify before writing the seed script (not assumed here)

1. **Remedial "Critical" severity** — confirm whether it's a stored column or computed from days-past-due in the UI/API before claiming the existing `91+` rows satisfy UAT-065. If computed, no seed needed; if stored and unset, one more field to backfill.
2. **Agent lead pipeline-stage chips** ("Awaiting link" / "Gathering docs" / "Docs ready") — confirm these derive from document-checklist completeness rather than a `leads.stage` column (the column doesn't exist in the schema, so it's very likely computed) before assuming the 48 open leads already cover UAT-019.

Both are quick reads, not re-audits — flagging them here so the seed script isn't written against a guess.

---

## 5. Safety mechanism (why this won't break anything)

This repo already has a precedent for exactly this problem — `scripts/reseed-demo-data.ts` — and the new seed script should follow the same rules, not invent new ones:

1. **Everything new is scoped to an unambiguous, greppable identity.** Borrower emails `demo.borrower.uat.%@example.local`, staff-entered names prefixed `[UAT Demo]` in any free-text field. Nothing is ever written to an existing row.
2. **Dry run by default.** The script prints exactly what it would insert and exits; only `--apply` writes.
3. **Idempotent.** Re-running it after a partial failure must not create duplicates — check for the scoped email/prefix before inserting.
4. **No deletes, no updates to existing rows, ever.** Every gap in §2 is closed by an `insert`, never a `update ... where status = ...`.
5. **Route every write through the app's own service-role helpers** (`generateAmortizationSchedule`, `computeSmeLoan`/`computeSeafarerLoan`, the same functions `reseed-demo-data.ts` imports) rather than hand-typed numbers, so a demo application's schedule/computation is internally consistent and doesn't itself misrepresent the product.
6. **A rollback list.** The script logs every inserted row's id to a local file as it goes, so a single follow-up script can delete exactly those ids and nothing else if something needs to be undone.

I'd also flag directly: given there's no branch/staging environment, worth asking whether a temporary Supabase branch (the project's MCP already exposes `create_branch`/`merge_branch`) is worth using for this specific seeding run — test the script against the branch, confirm the UAT screens render correctly, then merge. That costs one extra step but removes all risk to the live database during the seed script's first real run. Recommended, not assumed — flagging it as a decision for you, not deciding it here.

---

## 6. What this plan does not cover

- It does not write the seed script itself — that's the next step, and per the existing project workflow (Claude plans, Cursor implements) belongs with Cursor working from this document.
- It does not touch Appendix A's blank fields (Project Owner, tester names, dates) — those are your call, not data.
- It does not assume the two §4 items — they need a 5-minute code read before the script is written, not a guess baked into seed values.
