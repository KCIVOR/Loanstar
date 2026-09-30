# LoanStar Handover Readiness Checklist

**Purpose:** Use this checklist before handing the system over. It is written for business testing: tick an item only after it has been tried successfully in the handover environment.

**Important:** A tick means the expected result was seen, no error message appeared, and the information saved correctly after refreshing the page. If an item fails, write the issue in the log at the end, leave the item unticked, and retest it after the fix.

## How to use this checklist

For every relevant role, use a safe test account and test data. Test the normal action first, then an invalid or incomplete action where the checklist asks for it. Confirm that people can only see the work and actions intended for their role.

Before signing off, make sure every applicable item is either:

- checked as passed;
- marked **Not applicable** with a reason; or
- listed as an open issue with an owner and target date.

## 1. Start-up, sign-in, and access

- [ ] The home page opens without a broken layout or error message.
- [ ] A new borrower can register and receives clear guidance if required details are missing.
- [ ] A registered user can sign in and is taken to the correct work area.
- [ ] A user can request a password reset and complete the reset safely.
- [ ] Incorrect sign-in details show a clear message without revealing private account information.
- [ ] A signed-in user can sign out and can no longer open protected pages by using the browser back button.
- [ ] Each role reaches only its own work area: Borrower, Agent, CSA, CIG, Committee, LRA, AR, Collector, Remedial, Administrator, and Reports.
- [ ] A user who tries to open an area they are not allowed to use sees an access-denied message rather than private data.
- [ ] The main dashboard loads its totals, charts, and links without empty or misleading information.
- [ ] The account page lets a user update permitted profile details, notification choices, and profile image; the change remains after refresh.

## 2. Borrower journey

- [ ] A borrower can create an application with all required personal or business information.
- [ ] Required fields, dates, money amounts, phone numbers, and email addresses are checked before submission.
- [ ] A borrower can add, edit, and remove a co-borrower where allowed.
- [ ] A borrower can upload required documents, view them, download them, and receives a clear message for an unsupported or failed upload.
- [ ] A borrower can save an unfinished application and return to it later without losing entered information.
- [ ] A borrower can submit an application only when all required information and documents are complete.
- [ ] The borrower sees an understandable progress timeline and the current application status.
- [ ] The borrower can read the loan computation and submit a counter-offer or message where the process allows it.
- [ ] The borrower can receive, read, and sign required briefing, computation, and release documents.
- [ ] A borrower can view an active loan, payment information, and available payment documents without seeing another borrower's data.
- [ ] A borrower can start a reloan only when eligible, and the new request is connected to the correct previous loan.

## 3. Agent and lead handling

- [ ] An Agent can create a lead with valid contact details.
- [ ] The system prevents duplicate or clearly conflicting borrower records and explains what to do next.
- [ ] An Agent can search for an existing borrower before creating a new lead.
- [ ] An Agent can open, update, and follow the history of a lead.
- [ ] An Agent can convert an eligible lead into the next step of the application process.
- [ ] Lead lists, search results, and history show the correct borrower, status, and dates.

## 4. CSA application processing and loan computation

- [ ] A CSA can create a new application and find existing borrowers and leads.
- [ ] A CSA can complete the initial interview, privacy orientation, and required checks.
- [ ] A CSA can place an application on hold, add the reason, and clear the hold when appropriate.
- [ ] A CSA can connect a borrower account and send the application forward without losing data.
- [ ] A CSA can upload, download, and review application documents.
- [ ] A CSA can prepare the application form, disclosure, checklist, and endorsement at the correct stage.
- [ ] A CSA can calculate a loan and sees totals, fees, dates, and payment amounts that match the approved business calculator.
- [ ] Changing the loan amount, term, product, or payment frequency updates the calculation clearly and correctly.
- [ ] The **Auto/REM collateral** calculation uses the correct collateral treatment: no security fee and no unexpected extra months.
- [ ] The following payment choices appear only for the loan products allowed to use them: monthly, semi-monthly, weekly, every 15 days, quarterly, every two months, and daily.
- [ ] Weekly invoice financing allows only 1-, 2-, or 3-month terms; shows the correct interest progression; does not add an inappropriate fee bundle; and places principal due one week after the final interest payment.
- [ ] Every-15-days schedules have two payments per month, are 15 days apart, and add up correctly.
- [ ] Quarterly schedules allow the correct term, show separate interest and principal lines for each payment, and add up correctly.
- [ ] Every-two-months schedules allow the correct term, show separate interest and principal lines for each payment, and add up correctly.
- [ ] Daily schedules have one payment per day, the expected number of rows, consecutive dates, and correct totals.
- [ ] An invalid payment choice or term is blocked with a helpful message rather than saving incorrect information.
- [ ] The CSA can witness or record the required computation signature.
- [ ] A CSA can send an application to CIG or Committee, request a revision, and see the updated status.
- [ ] The early-settlement discount lets the CSA select future months, enter a percentage from 0% to 100%, and see the discount update correctly; one selected month must not create a negative discount.

## 5. CIG review and verification

- [ ] CIG can see the correct applications assigned for review.
- [ ] CIG can review the application, checklist, documents, and all completed CSA checks.
- [ ] CIG can record borrower references, field visits, collateral inspections, and reloan verification where relevant.
- [ ] CIG can request a correction, return an application, forward it, or cancel it; the reason and updated status are visible to the next role.
- [ ] CIG can record callbacks, mark them resolved, and see callback history.
- [ ] CIG can record a denial notification and view denial-call history.
- [ ] CIG history correctly shows forwarded, returned, cancelled, and completed work.

## 6. Committee decision and negotiation

- [ ] Committee members can see applications awaiting decision and open all required information.
- [ ] A Committee member can complete the checklist, assessment, and vote.
- [ ] The system records the decision and shows the correct status to the borrower and internal teams.
- [ ] A Committee member can approve, decline, request revision, or approve without a signature only when permitted.
- [ ] The committee can make an allowed override; the recalculated terms, payment schedule, and audit trail are correct.
- [ ] The borrower can receive an offer, counter it where allowed, and accept it; both sides see the same negotiation history.
- [ ] A decision email can be sent again when needed without changing the decision itself.
- [ ] Committee history accurately shows completed decisions.

## 7. LRA documents, signing, and release

- [ ] LRA can see the release queue and open the correct application.
- [ ] LRA can review the required checklist, document path, final computation sheet, and PDC details.
- [ ] LRA can generate the correct loan documents for the selected borrower, loan product, collateral, payment schedule, and co-borrower situation.
- [ ] Generated documents show the correct names, dates, amounts, payment terms, and signature areas.
- [ ] A document can be downloaded, previewed, signed one at a time, or signed in the supported group action.
- [ ] LRA can upload combined signed documents and the stored files can be opened afterwards.
- [ ] LRA can collect and record PDC details where required.
- [ ] LRA can issue the acknowledgement receipt and release the loan only after all required actions are complete.
- [ ] Releasing a loan sends it to the correct next area and prevents accidental duplicate release.
- [ ] LRA history shows the released and closed applications correctly.

## 8. Document and template quality

- [ ] An Administrator can create, edit, preview, save as draft, publish, and download document templates.
- [ ] Publishing a new template does not unexpectedly change unrelated templates.
- [ ] A document preview and downloaded DOCX/PDF render without missing text, broken tables, overlap, or unreadable pages.
- [ ] Test at least one document for every live loan-product and borrower-type variation, including co-borrower, collateral, corporate, individual, invoice, bi-monthly, and per-day cases where applicable.
- [ ] All legal names, amounts, dates, fees, payment terms, and signature labels are correct in the generated test documents.
- [ ] The email-template list, editor, and test-email function work with a safe test recipient.
- [ ] The system makes it clear when a document cannot be generated and does not mark the application as complete by mistake.
- [ ] Any legal-template question that needs a business decision is recorded before handover; it is not silently treated as a software pass.

### Known document items to resolve or formally accept

- [ ] Decide the final approach for the separate Seafarer and SME Promissory Note source documents.
- [ ] Decide the correct second-signer treatment for the Individual Consent Form source.
- [ ] Confirm or supply a source example for the DTI borrower paragraph in the Loan Agreement.
- [ ] Decide whether to add a shared vehicle “Body Type” field for the mortgage-cancellation document.
- [ ] Formally accept or correct the known title-size differences in the AR ATM Voucher and Agreement for Consolidation.
- [ ] Record how the 11 templates with no original source document will receive legal/business review.

## 9. Accounts Receivable (AR)

- [ ] A newly released loan arrives in the AR queue once, with the correct borrower, balance, due dates, and schedule.
- [ ] AR can open the master list and an individual account; totals, schedule rows, due dates, aging, and balances match the released loan.
- [ ] AR can view the application checklist and release documents for an account.
- [ ] AR can record a payment and download the payment record.
- [ ] AR can create, review, reject, and reconcile a daily collection report, including individual report items.
- [ ] The system prevents a duplicate daily collection report or duplicate posting and explains why.
- [ ] A bounced payment is handled correctly and updates the account without corrupting prior payments.
- [ ] AR can move a payment when permitted; amounts, balance, history, and approvals remain correct.
- [ ] AR can create, confirm, or reject an internal transfer with a complete history.
- [ ] AR can process a rounding write-off only with the proper control and audit record.
- [ ] AR history shows accounts, daily collection reports, transfers, and write-offs correctly.
- [ ] Penalties, effective balance, discounts, aging, and paid-off status match expected test cases.

## 10. Collections and remedial work

- [ ] A Collector sees the correct assigned accounts and can open the loan file and case file.
- [ ] A Collector can read the borrower briefing, record contacts, add reminders, and view the history.
- [ ] A Collector can record a payment, download its record, and see the account balance update correctly.
- [ ] A Collector can prepare a demand letter and the generated letter contains the correct borrower, amount, and account details.
- [ ] A Collector can check eligibility for a move of payment, see the surcharge, submit the move, and get the correct resulting schedule.
- [ ] A Collector can use the daily collection report process and see its report history.
- [ ] A Collector can view closed-account and remedial-turnover history.
- [ ] Remedial users can view the correct accounts, case files, documents, checklists, demand letters, and payment actions.
- [ ] A remedial payment or status action cannot be performed twice by refreshing the page or submitting again.

## 11. Administration and controls

- [ ] Administrators can create, update, deactivate, and search user accounts; deactivated users can no longer sign in.
- [ ] Administrators can create roles, set permissions and field rules, and confirm a test user receives exactly those permissions.
- [ ] Administrators can manage selectable loan types and confirm the changes appear correctly in the application process.
- [ ] Administrators can manage stage checklists and see them in the correct work stage.
- [ ] Administrators can review audit records and identify who performed a significant action and when.
- [ ] Administrators can update configuration safely and invalid values are blocked with a clear message.
- [ ] The email, SMS, document-rendering, and reporting-assistant connection tests give a clear pass or failure result.
- [ ] System checks and audit pages load without exposing passwords, access keys, or private borrower information.

## 12. Reports, search, and notifications

- [ ] Reports dashboard totals agree with the underlying test data.
- [ ] Pipeline, account, collection, past-due, and insight reports open, filter correctly, and show understandable empty states.
- [ ] The reporting assistant can start a conversation, retain the correct thread, provide a useful answer, and handles unavailable data clearly.
- [ ] Notifications show the correct events for the signed-in person and can be read without exposing other users’ notifications.
- [ ] Search, filters, date ranges, pagination, and history views return the correct results and do not lose the selected filters unexpectedly.
- [ ] Scheduled reminders are tested in a safe environment and do not send duplicate or incorrect reminders.

## 13. Error handling, safety, and usability

- [ ] For every critical action above, test a missing required field, an invalid value, and a network/service failure where safe; the user sees a clear message and no partial or duplicate record is created.
- [ ] Buttons show progress while saving and cannot accidentally submit the same action twice.
- [ ] Refreshing the page after a completed action shows the same saved result.
- [ ] Browser back/forward navigation does not expose private data or cause duplicate actions.
- [ ] Large lists, long schedules, and daily-payment accounts remain usable and load in a reasonable time.
- [ ] The system is usable at common laptop and mobile screen widths: text is readable, buttons remain reachable, and no essential content is cut off.
- [ ] Forms can be completed with keyboard navigation and have readable labels and error messages.
- [ ] Dates, currency, totals, names, and status labels are understandable and consistently formatted.
- [ ] No test account, test document, or sample payment is left in a state that could be mistaken for a real transaction.

## 14. Final release checks

- [ ] Run the project’s automated checks and record the date, result, and person who ran them.
- [ ] Run the full browser-based test suite in the handover environment and record any skipped tests with a reason.
- [ ] Complete a real end-to-end test: borrower application → CSA → CIG → Committee → LRA release → AR → payment/collection.
- [ ] Complete one end-to-end test for each special payment arrangement: Auto/REM collateral, Invoice/Weekly, every 15 days, quarterly, every two months, daily, and early settlement.
- [ ] Confirm all open items from the “Known document items” section have an owner and written handover decision.
- [ ] Confirm that no critical or high-priority issue remains open.
- [ ] Give the handover team the list of test accounts, support contacts, recovery steps, and locations of important documents—without sharing passwords in this checklist.
- [ ] Confirm backups, environment settings, external-service contacts, and access ownership are known by the receiving team.
- [ ] Hold a handover walkthrough with each affected business role and record questions or follow-up work.

## Issue log

| No. | Checklist section/item | What happened | Severity | Owner | Target date | Retested / result |
| --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |
| 3 |  |  |  |  |  |  |

## Handover sign-off

| Role | Name | Date | Sign-off / notes |
| --- | --- | --- | --- |
| Business owner |  |  |  |
| Operations representative |  |  |  |
| Finance / AR representative |  |  |  |
| System administrator |  |  |  |
| Delivery / project owner |  |  |  |

**Handover decision:** [ ] Ready to hand over  [ ] Ready with accepted follow-ups  [ ] Not ready
