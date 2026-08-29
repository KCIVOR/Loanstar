# Payment Frequency — Full End-to-End Manual Test Guide

One complete walkthrough: **application creation → compute → CIG → Committee → borrower sign → LRA (release path → PDC encoding → generate → sign → briefing → release → close) → active AR account**, with real button labels at every step, for the SME schedule-type feature. This supersedes flipping between the computation-only guide and the LRA/PDC guide — everything's here in one place.

Do the full walkthrough once with **Quarterly** (it exercises the hardest cases — dual-line PDC checks, term-divisibility validation). Then use the condensed table in §10 to repeat just the computation-specific parts for the other 5 schedule types.

---

## 0. Automated check (optional, fast)

```bash
npm test
```
Expect `1424 passing, 0 failing`. Proves the math and PDC-validation logic; this guide proves the actual click-path works.

---

## 1. Create the application

**CSA → Applications → New** (or convert a lead).

1. **Loan segment**: `SME`
2. **Entity type**: either
3. **Collateral**: `Clean (no collateral)`
4. **Loan schedule** (new field, SME-only): `Quarterly`
5. Fill borrower email/name, click **"Create application"**.

---

## 2. Privacy Orientation + Initial Interview

Complete both on the application page — required before Computation unlocks. (Unchanged by this work; use whatever your normal flow is.)

---

## 3. Compute

Go to the application's **Computation** tab.

| Field | Value |
|---|---|
| Input mode | `Principal` |
| Amount | `100000` |
| Terms | `12` |
| Addon months | `0` |
| Interest | `3` (%/mo) |
| Processing fee | `10` (%) |

"Loan schedule" shows as **read-only text**: `Quarterly`, with a hint: *"Terms must be divisible by 3 (e.g. 6, 9, 12 months)..."*.

Click **"Compute"**. Expect: 4 due dates internally (verified later in PDC), Total Interest reflects the quarterly math.

---

## 4. Endorse to CIG

On the CSA application page, click **"Endorse to CIG"** (button appears once the intake checklist/computation/signature prerequisites are met).

---

## 5. CIG — verify and forward to Committee

On **`/cig/applications/{id}`**:

1. **Field completeness** card → set "Field completeness OK?" to Yes.
2. **Borrower interview** card → answer the 3 confirmation selects + notes → **"Save borrower review"**.
3. **External checks** card → click **"Pass"** on each check row.
4. **CI & References Form** card → **"Open CI & References Form"** → fill and save the modal.
5. (Seafarer only — skip for this SME walkthrough) Crewing manager card.
6. **Finding** section → set to `Positive`, add notes.
7. **CI report** card appears → **"Submit CI report to Committee"** → confirm **"Yes, submit"**.

Expect: message *"CI report submitted — file is with Committee."*

---

## 6. Committee — approve

On **`/committee/applications/{id}`**:

1. Review the CI Report / 4 Cs assessment.
2. In the **Votes** card, click **"Vote Approve"** (repeat per required voter if your committee size > 1).
3. Once enough votes are in, the **Final action** card appears → click **"Approve loan"** → confirm **"Yes, approve"**.

**Note for testing Committee's schedule-type override** (§9 below): if you want to test Committee changing the schedule type mid-negotiation, this is also where the Computation panel shows an **editable** "Loan schedule" dropdown (unlike CSA's read-only text) — you can override the amount/rate/schedule here before or instead of a plain approve.

Expect: status moves toward negotiation/disclosure automatically.

---

## 7. Disclose + sign

Back on the **CSA application page**, "Negotiation & disclosure" card:

1. Click **"Disclose terms to borrower"**.
2. Once the negotiation is `awaiting_signature`, either:
   - **Borrower portal path**: borrower logs into `/borrower/applications/{id}`, clicks **"Review & confirm computation"** → confirms.
   - **CSA in-branch witness-sign** (faster for testing): same CSA page, click **"Proceed without borrower's sign"** → confirm **"Yes, proceed"**.

Either path queues the file for LRA.

> **Shortcut for repeat test runs**: Committee's **"Approve without borrower's sign"** button (step 6) collapses approve + disclose + witness-sign into one click and queues straight for LRA — use it once you've verified the separate steps work, to speed up testing the other 5 schedule types.

---

## 8. LRA — release path

Go to **`/lra/applications/{id}`**.

**"Release path"** card: check **"With PDC"**, click **"Save path"**.

---

## 9. LRA — PDC encoding (the step this whole guide exists to prove)

**"PDC encoding"** card.

**Expected summary fields** (this is what was broken and is now fixed):

| Field | Expected for Quarterly, 12-month term |
|---|---|
| Number of checks | **8** (4 quarters × 2 lines) — with caption *"Derived from this loan's schedule type, not the raw term count"* |
| Amount | *"Varies per check — see schedule below"* |
| First check date | read-only, from the computation |

If "Number of checks" instead shows `12` (the raw term count), the fix regressed.

Click **"Build schedule"**.

**Expected table** ("PDC details", 8 rows):
- Rows 1–2 share a due date 3 months after release; row 1 = interest-only amount, row 2 = the larger principal-bearing amount
- Rows 3–4 share the next due date (6 months after release), same interest/principal split
- ...continuing through rows 7–8 at 12 months after release (the final quarter, where the principal portion completes the loan)
- Only **Check no.** and **Bank/Branch** columns are editable; **Date** and **Amount** are fixed/computed

Fill in a check number + bank/branch per row (or use the dev Autofill "⚡" overlay's **"Fill PDC details"** action if available).

Click **"Save PDC schedule"**.

Expect: green banner *"PDC schedule saved."*, draft table replaced by a read-only **"PDC schedule"** card.

**Negative test**: leave one row's Check no. blank before saving → expect inline error *"Check number is required for PDC #N."* in the Alert banner near the top of the page.

---

## 10. LRA — generate, sign, briefing, release, close

1. **Generate**: "Generate documents" card → **"Generate release documents"**.
2. **Sign**: "Generated documents" card → **"Mark all signed"** → confirm **"Record all remaining signatures?"** → **"Yes, mark all signed"**.
3. **Briefing**: LRA page shows a banner to hand off to the Briefer. Switch to **`/collector/briefings`**, find the file, click **"Conduct briefing"** → confirm **"Briefing completed"**.
4. Back on the LRA page, **Release**: "Release cash" card → **"Record release"** → confirm **"Yes, record release"**.
5. If the release path includes PDC: **"Confirm physical PDCs collected"** (separate from encoding — this is confirming the physical checks were handed over).
6. **Close**: "Close & transmit" card → **"Close file"** → confirm **"Yes, close file"**.

**This is the step that actually proves everything end-to-end**: closing the file automatically calls `initializeArAccount` (no separate button — the UI itself says *"The AR masterlist account is created automatically"*), which builds the real AR amortization schedule using the exact same engine (`generateQuarterlySchedule`) as the PDC schedule you just verified in §9.

---

## 11. Final verification — AR masterlist matches PDC

Go to **AR → Masterlist → this loan's account → Amortization Schedule**.

**Expected**: the same 8-row shape you saw in the PDC table — same due dates, same interest/principal split amounts. If the AR schedule disagrees with the PDC schedule you already saved (different count, different amounts, different dates), something in the "PDC and AR must never diverge" guarantee broke — check whether `buildExpectedPdcSchedule` (server) and `buildPdcRows` (client, in the LRA page) are still both calling `generateQuarterlySchedule` with the same inputs as `initializeArAccount` does.

---

## 12. Repeat for the other 5 schedule types

Steps 1–2 and 4–8 and 10 are identical regardless of schedule type. Only **step 1's Loan schedule pick** and **step 3's compute inputs / step 9's expected PDC table** change:

| Schedule type | Compute inputs | Expected PDC check count | PDC pattern |
|---|---|---|---|
| **Invoice (Weekly)** | Amount 100000, Terms 3 | **13** | 12 escalating weekly (1%→2%→2.5%) + 1 final principal row, much later date |
| **Bi-monthly** | Amount 100000, Terms 6, Addon 0, Interest 3%, PF 10% | **12** | Every 15 days from release, flat half-amortization each, last absorbs rounding |
| **Quarterly (6-month)** | Amount 100000, Terms 6 | **4** | Same dual-line pattern as the 12-month walkthrough above, just 2 quarters instead of 4 |
| **Two-monthly** | Amount 100000, Terms 4 | **4** | Dual-line every 2 months instead of every 3 |
| **Daily** | Amount 100000, Interest 3%, **Payment date** field required (e.g. release +5 days) | **1** | Single row, principal + day-count interest, on the exact date typed |

For **Daily** specifically: step 3 has an extra required **Payment date** field (only appears when Loan schedule = Daily) — computing without it should be blocked with *"Payment date is required for Daily Interest loans."*

For **Invoice** specifically: at step 3, changing Terms to anything outside 1–3 should be rejected before compute even runs.

---

## 13. Regression pass

Run one **Regular (Monthly)** SME loan and one **Individual + Salary** loan through this entire pipeline. Both should look and behave exactly as they did before any of this work — no "Loan schedule" field for Individual, "Number of checks"/"Monthly amount" showing flat figures for both, dates one calendar month apart (Monthly) or alternating 15th/end-of-month (Salary). If either regressed, something in this feature leaked into the untouched paths.
