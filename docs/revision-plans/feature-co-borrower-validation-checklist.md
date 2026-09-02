# Co-Borrower — Step-by-Step Validation (User Journey)

**Purpose:** a manual walkthrough anyone can follow to confirm the co-borrower feature works. Companion to [feature-co-borrower-section.md](feature-co-borrower-section.md). Every "Expected result" here was observed once during the 2026-09-01 live check.

**The one thing to know first:** co-borrower fields are **conditional**. They only appear once an application has `co_borrower_required = true`, which the **Committee** sets when approving. They are **hidden for the Seafarer segment** everywhere. The requirement is **advisory** — it never blocks a release.

---

## Before you start

- Use the **"Quick login (seed accounts)"** panel on the login screen (one click per role — CSA, Committee, LRA — no password).
- You need a **non-Seafarer** application (SME or Individual). Seafarer apps will never show these fields.
- Two ways to get an application into the required state:
  - **A — real path** (Journey 1 below): push an SME/Individual application through intake → CIG → Committee and approve it with the checkbox ticked. Needs a full committee vote quorum (3 voters on the seed data), so this is the slow path.
  - **B — shortcut** for testing everything *after* the flag: run one SQL statement to set the flag on an existing SME application, then start at Journey 2.
    ```sql
    UPDATE loan_applications SET co_borrower_required = true
    WHERE application_no = 'AN300427';   -- Rosa Bautista, SME / Individual, "submitted"
    ```
    Undo it in **Cleanup** at the end.

---

## Journey 1 — Committee attaches the requirement (real path)

| # | Action | Expected result |
|---|--------|-----------------|
| 1 | Log in as **Committee**. Open a **non-Seafarer** application that is at the **Committee** stage with **all votes cast** (the "Final action" card is visible). | You see **Approve loan / Deny loan / Hold** buttons. |
| 2 | Click **"Approve loan"**. | A confirmation dialog opens with Borrower / Net released / CIG recommendation, a **Remarks** box, and — below it — a checkbox **"Require a co-borrower before release"** with the note *"CSA will be asked to add the co-borrower's name and address. Advisory only — it does not block release."* |
| 3 | Tick the checkbox. Click **"Yes, approve"**. | The dialog closes; the application moves to **Approved**. No "blocker" banner appears (a missing co-borrower is not a hold). |
| 4 | Open the **same application as a Seafarer** application instead (repeat steps 1–2 on a Seafarer file). | **There is no "Require a co-borrower" checkbox** in the approve dialog. |

**What this proves:** the committee can attach the requirement in one action, on the approve path only, never for Seafarer.

> If you can't reach a full vote quorum on the seed data, use **shortcut B** and skip to Journey 2 — the checkbox render is a single `segment ≠ seafarer` condition and the backend rejection for Seafarer is checked again in Journey 4.

---

## Journey 2 — CSA fills in the co-borrower

| # | Action | Expected result |
|---|--------|-----------------|
| 1 | Log in as **CSA**. Open the flagged application's detail page. | Between the **"Application Form"** card and the **"Data Privacy Act orientation"** card there is a new **"Co-borrower"** card. |
| 2 | Read the card. | Caption: *"The approving committee requested a co-borrower for this loan — not yet provided. Add the co-borrower's name and address below. This is advisory and does not block release."* Below it: *"No co-borrower added yet…"*, a **"+ Add co-borrower"** button, and a **"Save co-borrowers"** button. |
| 3 | Click **"+ Add co-borrower"**. | One row appears with **Full name** and **Address** inputs and a **Remove** button. |
| 4 | Type a name (e.g. `Maria Santos Reyes`) and an address (e.g. `24 Rizal Ave, Baliwag, Bulacan`). Click **"Save co-borrowers"**. | A green **"Co-borrowers saved."** message appears. |
| 5 | Refresh the page (or navigate away and back). | The card caption changes to *"Co-borrower details requested by the approving committee."* and the row is still filled with the name and address you entered. |
| 6 | Click **"+ Add co-borrower"** again, add a second person, save. | Both rows persist on reload — multiple co-borrowers are allowed. |
| 7 | Remove all rows and save with the list empty. | It saves without error; the caption goes back to the "not yet provided" wording. Nothing is blocked. |

**What this proves:** the editor works before *and* after approval, saves through a dedicated route, and round-trips.

---

## Journey 3 — It reaches the documents and the LRA file

| # | Action | Expected result |
|---|--------|-----------------|
| 1 | As **CSA**, with at least one co-borrower saved, generate/regenerate the **Application Form** for this application (the document action in the CSA workspace). | Generation succeeds. |
| 2 | Open/download the generated Application Form PDF. | The co-borrower's **name appears** in the signature area (e.g. under "CO-BORROWER'S SIGNATURE OVER PRINTED NAME"). With multiple co-borrowers, names are joined with "; ". |
| 3 | Generate the Application Form for a **different** application that has **no** co-borrower requirement. | The co-borrower line is **blank** — exactly as before this feature. |
| 4 | If the application can be advanced to the **LRA / release** stage: log in as **LRA**, open the file. | If a co-borrower is on file → a **read-only "Co-borrower" panel** (name — address, no edit controls). If the requirement was set but the list is empty → an **amber warning**: *"The approving committee requested a co-borrower for this loan. No co-borrower details were provided. You may still proceed with release."* |
| 5 | From that warning state, continue the release. | The release **still proceeds** — the warning never blocks it. |

**What this proves:** the co-borrower flows into the printed form and is visible (read-only) to the release officer; the "missing" case warns but does not gate.

---

## Journey 4 — Guard checks

| # | Action | Expected result |
|---|--------|-----------------|
| 1 | On the flagged SME application, as CSA, add a row, clear the **Full name** field, and Save. | Rejected with a validation error — a co-borrower needs both a name and an address. |
| 2 | (Optional, needs browser dev console) As CSA, `PATCH /api/applications/<seafarer-app-id>/co-borrowers` with a co-borrower payload. | **400** — *"Co-borrowers do not apply to seafarer applications."* |
| 3 | Same call against a **non-flagged** SME application. | **400** — *"This application does not require a co-borrower."* |
| 4 | Same call against an application already **released** (`lra_pending` or later). | **400** — co-borrower details can no longer be edited at that status. |
| 5 | Flag a **Seafarer** application via SQL (`co_borrower_required = true`) and open it as CSA. | **No "Co-borrower" card appears** — the Seafarer exclusion holds even when the flag is set. Revert the flag afterwards. |

**What this proves:** the three guards (Seafarer, not-required, locked status) and the field-level validation all hold.

---

## Journey 5 — Regression (nothing else changed)

| # | Action | Expected result |
|---|--------|-----------------|
| 1 | Take a **normal** SME/Individual application with **no** co-borrower requirement through its usual flow (CSA → endorse → CIG → Committee approve **without** ticking the box → disclose → sign → release). | Identical to today at every step. No "Co-borrower" card anywhere. The generated documents show a blank co-borrower line. The plain "Approve loan" (box unticked) behaves exactly as before. |

---

## Cleanup

Undo any test flags so the demo data is back to normal:

```sql
UPDATE loan_applications
SET co_borrower_required = false,
    co_borrowers = '[]'::jsonb,
    co_borrower_completed_at = NULL,
    co_borrower_required_by = NULL
WHERE application_no IN ('AN300427');   -- plus any Seafarer app you flagged in Journey 4
```

Confirm nothing is left flagged:

```sql
SELECT count(*) FROM loan_applications WHERE co_borrower_required = true;   -- expect 0
```
