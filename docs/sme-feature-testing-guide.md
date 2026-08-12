# SME Loan Feature — End-to-End Testing Guide

This is a plain-language walkthrough to confirm the new SME (business) loan feature works correctly, side-by-side with the existing Seafarer loan process. Follow each journey in order, using a real (test) account. Each step tells you what to click and what you should see.

---

## Journey 1 — A Business Owner Applies for a Loan Themselves

This is the new capability: a borrower can now start an SME loan application without staff creating it for them.

1. **Log in** to the borrower portal as a brand-new customer (no prior loans).
2. Click **"Start application."**
   - *Expected:* A window pops up asking you to choose a loan type — **Seafarer** or **SME** — before anything is created.
3. Select **SME**, then choose **Individual** or **Corporate**, then click **Continue**.
   - *Expected:* You're taken into a new application, and the document checklist shown is the SME set (business permits, TIN, etc.) — not seafarer documents like a seaman's book.
4. Open the **application form** and fill in the business details (company name, nature of business, address, etc.).
5. Save the form.
   - *Expected:* The information saves without error, and re-opening the form shows what you entered.
6. Upload the required SME documents until the checklist shows 100%.
7. Click **Submit**.
   - *Expected:* The application status changes to "Documents Pending" and it now appears in the staff queue.

**Pass criteria:** You could choose SME up front, fill a business (not seafarer) form, and submit successfully.

---

## Journey 2 — Staff Processes That SME Application

1. **Log in** as a CSA (loan officer) and open the application submitted in Journey 1.
2. Confirm the applicant's identity is labeled correctly (business/company name shown, not "manning agency").
3. Run the **screening check**.
   - *Expected:* Instead of the seafarer "NCL check," you now see a **duplication check** — the system looks for matching company or owner names already in the system.
4. Proceed through the normal interview, checklist confirmation, and endorsement steps as usual.
   - *Expected:* Every step behaves the same as a seafarer file, just with business-appropriate labels and checks.
5. Endorse the file forward for approval/computation as normal.

**Pass criteria:** Staff can process the SME file through the same pipeline as a seafarer file, with correctly labeled, business-relevant checks — nothing breaks or gets stuck.

---

## Journey 3 — Documents Generated for an SME Loan

1. Once the SME loan reaches the release stage, generate the standard package (application form, acknowledgement receipt, release documents).
2. Open the generated documents.
   - *Expected:* Wording and fields reflect the **business** (company name, business address, nature of business) instead of seafarer wording (vessel name, manning agency).

**Pass criteria:** Paperwork reads correctly for a business borrower — no leftover "seafarer" language.

---

## Journey 4 — Staff Views After the Loan Is Active

1. Log in as **AR (Accounts Receivable)** and find the SME account in the masterlist.
   - *Expected:* The account is tagged **SME**, and the second line under the borrower's name shows the company name/business info instead of a manning agency/vessel.
2. Open the account detail page.
   - *Expected:* It clearly labels the fields as "Company" details rather than "Manning agency" details.
3. Log in as a **Collector** and find the same account in the collections list.
   - *Expected:* Same SME tagging and company info shown there too.
4. If the account becomes overdue, check the **Remedial** view.
   - *Expected:* Same SME tagging and company identity shown consistently.

**Pass criteria:** Every staff-facing screen that touches this account clearly shows it's a business account with the right identifying details — no blank or mislabeled fields.

---

## Journey 5 — A Returning SME Customer Applies Again

1. Using the same SME borrower from Journey 1, have their first loan marked as **fully paid**.
2. Log back in as that borrower and click **"Apply for reloan."**
   - *Expected:* No picker window appears this time — the system automatically knows they're SME and opens a new SME application directly, carrying over the same business type (Individual/Corporate).
3. Confirm the SME document checklist appears again automatically.

**Pass criteria:** A repeat business customer is never accidentally treated as a new seafarer applicant.

---

## Journey 6 — Confirm Nothing Broke for Seafarer Customers (Regression Check)

1. Log in as a **new** borrower and click **"Start application"** — but this time, either leave the picker on the default option or simply confirm **Seafarer**.
   - *Expected:* Behaves exactly as before — seafarer document checklist, seafarer form fields, no unexpected picker friction.
2. Have staff create a **new Seafarer application** the normal way (CSA-created).
   - *Expected:* Works exactly as it always has.
3. Check an existing **Seafarer** account in AR/Collector/Remedial views.
   - *Expected:* Still shows manning agency/vessel info as before — no SME labels appear.

**Pass criteria:** The seafarer experience is completely unchanged, for both borrowers and staff.

---

## Sign-Off Checklist

| # | Journey | Pass / Fail | Notes |
|---|---|---|---|
| 1 | Borrower self-serve SME application | ☐ | |
| 2 | CSA processes SME file (duplication check) | ☐ | |
| 3 | SME documents generate with business wording | ☐ | |
| 4 | AR / Collector / Remedial show SME identity correctly | ☐ | |
| 5 | Returning SME customer reloan inherits SME automatically | ☐ | |
| 6 | Seafarer journeys unchanged (borrower + staff) | ☐ | |

Once all six rows pass, the SME feature is ready to consider fully verified end-to-end. If any step doesn't match the "Expected" result, note exactly what screen and what you saw — that's enough to trace it back to the exact piece that needs fixing.
