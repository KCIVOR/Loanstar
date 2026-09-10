# Loanstar — Progress Report

- **Date:** September 10, 2026
- **Prepared by:** Rovick Romasanta
- **For:** Client progress review
- **Format:** Progress report with live walkthrough

---

## 1. Agenda / Meeting Purpose

**Progress report.** This session covers the three items agreed at the
September 9 review: the penalty ledger per-month balance view, automatic
document generation, and the recommendation on the data import/export template.
Two of the three are complete; document generation is in progress.

---

## 2. Features and Function

Work items agreed at the September 9 review.

| Action / Item | Owner | Target | Note |
| :---- | :---- | :---- | :---- |
| Add a per-month remaining-balance view to the penalty ledger so staff can tell a borrower their exact balance for a given month after a partial payment | Rovick Romasanta | Today | Screen change only; the penalty calculation was already accepted as correct. |
| Build automatic document generation for the loan-release (LRA) step, using the client's real documents | Rovick Romasanta | In progress | Main deliverable for this stream. |
| Recommend whether the data import/export should follow the client's existing masterfile format or the system's standard template | Rovick Romasanta | Today | Client provides sample files; decision needed to unblock migration. |

---

## 3. Milestones / Timeline

| Milestone | Date | Status |
| :---- | :---- | :---- |
| September 4 deliverables completed and presented | September 9, 2026 | Done |
| Penalty ledger — per-month remaining-balance view | September 10, 2026 (today) | **Done** |
| Data import/export template — recommendation | September 10, 2026 (today) | **Done** |
| Automatic document generation — development | September 10, 2026 (today) | **In progress — ~70%** |
| Remaining documents imported and formatting corrected | Next session | Pending |
| Full end-to-end test with all user roles | After document generation | Not started |
| Deployment | After full test | Timing to confirm |

---

## 4. Deliverables

### 4.1 Penalty ledger — per-month remaining balance — **Complete**

The ledger now shows the remaining amount owed for each month, updating as
payments come in. After a partial payment, a new line appears under that month
with the updated balance, and any remaining penalty is shown separately and
drops to zero once paid. Staff can now state a borrower's current balance for
any month on request. No change was made to the calculation.

### 4.2 Automatic document generation (LRA) — **In progress, ~70%**

| Part | Status |
| :---- | :---- |
| Generation engine and document picker at the loan-release step | Built and working |
| Mapping the client's documents into reusable templates | Complete — 66 client documents consolidated into 16 templates (one template covers all its variations, e.g. 1–4 vehicles, with/without co-borrower) |
| Core release set — Loan Agreement, Disclosure Statement, Promissory Note | Seeded |
| Consent Form and servicing letters (cancellations, surrender, demand letter, etc.) | Seeded |
| **Remaining ~30%** | Import the rest of the 70+ source documents into the system and correct the layout/formatting so generated PDFs match the client's originals |

**What "import" means here:** each client document is a filled-in legal form
(real names, amounts, dates). Bringing it in means replacing those specifics
with fill-in fields while leaving the legal wording exactly as written, then
checking the generated output against the original.

### 4.3 Data import/export template — **Complete (recommendation: use our template)**

**Recommendation:** the client copies their historical records into the
template we provide, rather than the system adapting to each of the client's
existing spreadsheets.

**Why (non-technical):**

- **One sheet, not three.** The client's records live in several different
  layouts today (SF Suncol, SME, C-Parer all look different). Our template is a
  single agreed sheet, so staff fill in the same columns every time — easier to
  learn, easier to check.
- **It matches what the system stores.** Every column on our template lines up
  with a field the system actually keeps and uses. A borrowed layout would need
  a translation step on every upload, which is slower and a common source of
  errors.
- **Mistakes are caught at upload.** Because the columns are fixed and known,
  the system can check a file the moment it's uploaded — right columns, required
  values present — and flag bad rows before they enter the system.
- **Low effort for the client.** Existing working files stay as they are; the
  data is copied into the provided sheet once, for the migration only.

---

## 5. Next Actions

| Action | Owner | Target |
| :---- | :---- | :---- |
| Import the remaining 70+ source documents and correct formatting so generated PDFs match the originals | Rovick Romasanta | Next session — progress update to follow |
| Send the final import/export template for the client to populate | Rovick Romasanta | This week |
| Provide historical records in the supplied template | Client | On receipt of the template |
| Confirm deployment timing and the point at which overdue accounts move to remedial handling (~90–125 days) | Client | Next session |
| Full end-to-end test with all user roles, then deployment | Rovick Romasanta | After document generation is finished |

---

*Two of three items for this session are complete: the penalty ledger per-month
balance view, and the import/export template recommendation (use our template).
Automatic document generation is about 70% done — the engine and template
structure are in place; the remaining work is importing the rest of the client's
documents and fixing formatting, with a progress update at the next session.*
