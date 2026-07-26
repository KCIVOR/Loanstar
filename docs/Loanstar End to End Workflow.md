### **0\. Borrower Portal**

**Owner:** Borrower

**Capabilities**

1. Borrower signs up / self-registers in the system; system assigns a Borrower Number on save.  
2. Borrower uploads requirements (Passport, Seaman's Book, employment contract, etc.) directly into their own profile.  
3. Borrower views real-time application status at every stage of the workflow (Intake → CIG Verification → Committee Decision → LRA Documentation/Release → Accounting → Collection).  
4. At the LRA/release stage specifically, the borrower's status view shows what is blocking release if applicable (e.g., missing PDC, incomplete documents) — addressing the original pain point of borrowers repeatedly calling LRA/CSA to ask "when will my loan be released."  
5. Borrower uploads proof of payment directly into the system during the repayment/Collection phase (replacing the manual hand-off of a physical/photo receipt to the Account Manager).  
6. Borrower can view loan history, status, and balance information tied to their Borrower Number.  
7. Borrower can apply for a reloan directly through the portal, tied to their existing Borrower Number and loan history.  
8. Borrower can send and receive direct messages / in-app chat with their assigned Account Manager.  
   ---

### **1\. Lead Generation & Client Intake**

**Owner:** Marketing / Agent

**Workflow**

1. Marketing/Agent generates leads and gathers borrower information.  
2. Agent logs in to their own portal to input lead details: borrower name, business name (if applicable).  
3. Agent uploads borrower requirements directly into the system on the borrower's behalf, **or** the borrower self-registers and uploads documents via their own portal (see Section 0).  
4. Agent can view their own submitted leads and a status flag (complete/incomplete) for commission tracking — but cannot view the actual uploaded documents (data privacy).  
5. Lead/application record is created in the system and made available to CSA.

**Trigger to proceed:** Lead/document upload (by agent or borrower) being saved in the system creates the record CSA begins processing.

**Borrower status visible at this stage:** "Application started" / "Documents pending" / "Application submitted."

### **2\. Client Intake & Preliminary Screening**

**Owner:** Customer Service Associate / CSA

**Workflow**

1. Client logs in (or is assisted by CSA) and provides basic details: Name, Agency, Loan terms, Contact details, Employment details. If the borrower has no account, CSA can create the application on their behalf — the record is linked to the borrower later via email or username when they decide to register or claim their account.  
2. CSA provides Data Privacy Act orientation.  
3. Client completes the loan application form in the system.  
4. CSA performs Negative Credit Listing (NCL) check.  
5. CSA conducts initial interview.  
6. CSA collects basic requirements — Passport, Seaman's Book, Employment contract (not always required at application; must be complied with before release), other supporting documents — and uploads them (or confirms the borrower's own uploads) into the borrower's file in the system, in standard order: Clearance Form (interview notes), Application Form, House Sketch, Supporting Documents. CSA can edit application information at any point during intake — correcting misspellings or completing missing fields — before clicking "Endorse to CIG.   
7. CSA prepares initial loan computation in the system (within the 35% coverage ratio limit).  
8. Borrower reviews and signs the computation.  
9. CSA clicks **"Endorse to CIG"** once the file is complete.

**Trigger to proceed to CIG:** CSA's manual "Endorse to CIG" action, available only once all required documents and the signed computation are present in the borrower's file. An incomplete file cannot be endorsed — held files are flagged/recorded in the system.

**Reopening rule:** CSA can only reopen/edit a file before clicking "Endorse to CIG." Once endorsed, CSA loses edit rights; any correction must be requested through CIG.

**Borrower status visible at this stage:** "Application on process" / "Pending requirements" (if CSA flags something missing).

### **3\. Verification & Due Diligence**

**Owner:** Credit Investigation Group / CIG

**Workflow**

1. CIG receives the endorsed file in their system queue.  
2. CIG calls the borrower directly to begin verification, checking each required field for completeness.  
3. CIG checks negative records via NFIS and Membership File (MF).  
4. CIG interviews the Person-In-Charge (PIC) regarding allotment awareness, payment awareness, and borrower reliability.  
5. CIG verifies employment with the Crewing Manager: departure date, salary, position, contract status.  
6. CIG conducts character reference checks.  
7. CIG fills out the verification form in the system (positive or negative findings — CIG records findings only and has no authority to deny).  
8. CIG can correct borrower information directly in the system (e.g., spelling errors) but cannot edit the computation form.

**Trigger to proceed to Committee:** Completion of the CIG verification form in the system — once fully filled out, the file automatically becomes visible to the Committee, regardless of positive/negative findings. A negative finding does not stop the file; only the Committee has denial authority.

**Trigger for hold/reschedule:** If the borrower can't be reached (in training, driving, asleep, etc.), CIG holds the file, logs a scheduled callback date/time, and moves to the next borrower in priority order. The file resurfaces in CIG's queue once the scheduled callback time arrives.

**Borrower status visible at this stage:** "Application for verification."

### **4\. Loan Deliberation & Decision**

**Owner:** Approving Committee (currently 3 designated officers)

**Workflow**

1. Committee receives the completed file once CIG's verification form is in.  
2. Committee reviews document completeness and validates data accuracy.  
3. Committee assesses the borrower using the 4 Cs: Character, Capacity, Capital, Conditions.  
4. Each of the 3 committee members casts an individual vote (approve/deny) in the system. All 3 votes are logged and visible for transparency/audit, regardless of who later finalizes the decision.  
5. Committee may attach a comment specifying what needs revision (for Notice to Revisit cases).  
6. Once a majority (2 of 3\) is reached, the vote tally becomes visible on the dashboard (e.g., "2/3 — Approve") — **this tally is informational only and does not move the file forward by itself.**  
7. **Any one of the 3 committee members** must then click the dedicated final action button (Approve / Deny / Notice to Revisit / Hold) to actually finalize and move the file forward. This click does not have to come from someone in the majority — any of the 3 can perform it.

**Trigger for final decision:** The explicit final-action click by any one of the 3 committee members is what actually triggers the next step — the vote tally alone does not auto-proceed. This applies uniformly across all outcomes; there is no separate auto-route behavior for Denied or Notice to Revisit either.

**Decision Outcomes**

| Decision | Trigger | Next Action |
| ----- | ----- | ----- |
| Approved | Final-action click by any of the 3 (after votes are in) | File becomes visible to CSA/Processing to disclose approved amount/terms |
| Denied | Final-action click by any of the 3 | System sends automatic email to borrower (no reason disclosed); CIG also informs borrower by call |
| Notice to Revisit | Final-action click by any of the 3, with comment attached | File routes back to CSA or CIG; once corrected, re-enters Committee review |
| Hold | Final-action click by any of the 3 | File remains pending until resolved |

**System note — vote log:** The system records each of the 3 individual votes, the timestamp of each, and which committee member performed the final action click — preserving a full audit trail even though only one click ultimately finalizes the outcome.

**System note — Turnaround Time (TAT):** Each file logs a "days pending" counter on the Committee dashboard, counting from CIG handoff to the final-action click (not just to majority vote).

**Borrower status visible at this stage:** "Application for approval" → "Approved" / "Denied" / "For revision" / "On hold" (notification triggered only once the final-action click occurs, not when majority is merely reached).

### **5\. Negotiation (if approved amount differs from requested amount)**

**Owner:** Approving Committee / CSA

**Workflow**

1. CSA discloses the approved amount and terms to the borrower.  
2. If the borrower disagrees (e.g., requested ₱100,000, approved ₱70,000), the borrower may counter-offer.  
3. The counter-offer routes back to the Committee/Approving Officer — not CIG, since CIG's part of the process is already complete.  
4. Committee can override and adjust the approved amount; the computation form recalculates automatically.  
5. This negotiation loop repeats until the borrower agrees to a final amount.

**Trigger to proceed to LRA:** The borrower's signature on the (possibly revised) computation form — explicitly named in the meeting as "the trigger." Verbal agreement alone does not trigger LRA; the signed form does.

**Borrower status visible at this stage:** "Negotiating terms" / "Awaiting your confirmation."

### **6\. Loan Disbursement & Closing**

**Owner:** Loan Releasing Associate / LRA (organizationally part of Accounting, but a distinct login/role in the system)

**Workflow**

1. LRA receives the signed computation form in their queue — this signed form is LRA's trigger to begin documentation.  
2. Borrower signs Letter of Intent.  
3. If a borrower has no checking account, LRA instructs borrower to open one at a partner bank (required for PDC issuance).  
4. LRA encodes Post-Dated Check (PDC) details into the system — amount, date, check number, and bank name — prior to document generation, as this information is included in the Borrower Loan Released Info (BLRI) that the borrower will sign.  
5. LRA prepares legal documents — auto-generated by the system from the computation form and borrower information already on file (no manual re-entry or re-upload): Promissory Note, Disclosure Statement, Loan Agreement, Check Voucher, other required documents.  
6. Borrower signs all loan documents — this signing is the explicit trigger LRA uses to confirm documentation is complete before transferring to Accounting.  
7. LRA collects Post-Dated Checks (PDCs) for all amortizations.  
8. LRA transfers the completed computation and full document set to Accounting via the system (no manual file transfer).

**Trigger for Collection Head briefing:** All loan documents being signed by the borrower (step 5\) triggers the Collection Head to begin the mandatory briefing on payment rules, due dates, penalties, and legal consequences.

**Trigger for check release:** Completion of the briefing — confirmed via a signed briefing acknowledgment/checklist in the system — triggers LRA to release the loan check.

**Trigger for "transaction closed":** LRA uploads a scanned copy of the signed Check Voucher into the system, which transmits it to the main branch electronically.

**Access control:** Once LRA finalizes a document in the system, it is locked — no further edits by anyone. Committee and CSA cannot view LRA's finalized release documents (confidentiality). All actions are timestamped for audit integrity. LRA and CSA are separate logins/roles even when held by the same person.

**Borrower status visible at this stage:** "For release" / "Pending: \[specific blocker, e.g., PDC not yet submitted\]" / "Documents signed, awaiting check release" / "Released."

### **7\. Financial Management & Posting**

**Owner:** Accounting Department / Accounts Receivable (AR)

**Workflow**

1. AR receives the closed transaction file from LRA in the system; the borrower's loan details auto-populate into the AR Masterlist — receipt of the closed file is AR's trigger to encode the new loan record.  
2. AR (or designated approver) manually tags/assigns the borrower to a portfolio and a Collector/Account Manager within the system.  
3. AR manages check transmittals and the 3-day clearing period in the system.  
4. AR receives Daily Collection Reports (DCR) submitted by Collection through the system, with receipts/uploads attached as proof of payment — receipt of the DCR is AR's trigger to begin reconciliation.  
5. AR cross-checks the DCR amount against actual bank deposit confirmation.

**Trigger to mark "Paid"/"Posted":** Confirmation that the reported payment has actually landed in the bank account (i.e., the deposit matches the DCR) is the explicit trigger for AR to tag the payment as Posted/Paid in the system. This status change becomes immediately visible to the Collector and the borrower.

6. AR reconciles records and generates Performance, Aging, and Collection reports from system data.

**Note on portfolio assignment:** Portfolio assignment has no automatic system trigger — it's a manual grouping decision made by AR/admin (e.g., grouping by investor), recorded in the system for tracking purposes.

**Borrower status visible at this stage:** "Loan active" with current balance, amortization schedule, and payment history.

### **8\. Payment Monitoring & Collection**

**Owner:** Collection Department (Collector / Account Manager) and Borrower

**Workflow**

1. Collector views their assigned borrower list on their dashboard — assignment by AR populates the Collector's dashboard; this is then an ongoing daily monitoring task, not a one-time trigger.  
2. Amortization schedules are system-generated automatically from the approved computation (no manual calculation).  
3. Collection sends monthly Text Brigade reminders.  
4. Collector follows up on due borrowers via call/text, in priority order, logging scheduled callback times in the system for unreachable borrowers.  
5. Borrower uploads proof of payment (receipt, reference number, date) directly into the system upon paying — via bank deposit, check, or POS/cash.  
6. Collector reviews the uploaded payment proofs for their assigned borrowers and compiles the day's Daily Collection Report (DCR) within the system itself (no separate Excel form).

**Trigger to send to AR:** Submitting the completed DCR in the system (with all confirmed payments and attached/uploaded proofs) is the explicit trigger that routes it to AR for posting.

7. For missed payments: follow-up after 1 day; penalty applied as a configurable percentage of the outstanding balance.  
8. For 30-day defaults: penalty compounds onto next month's balance.  
9. For 90-day hardcore/past-due accounts: the 90-day aging threshold is the explicit trigger for AR to reassign the account in the system from the regular Collector to a Remedial/Paralegal collector.

**Borrower status visible at this stage:** Current balance, due date, payment status ("Paid" / "Pending verification" / "Past due"), and full payment history.

---

End-to-End Workflow Summary (with triggers and borrower visibility)

Borrower Sign-Up & Document Upload  
 → \[**Trigger: lead/documents saved in system**\] → (Borrower sees: On process)  
 Client Intake & Application (CSA)  
 → \[**Trigger: CSA clicks "Endorse to CIG" on a complete file**\] → (Borrower sees: For Verification)  
 CIG Verification  
 → \[**Trigger: CIG verification form completed in system**\] → (Borrower sees: For approval)  
 Committee Review  
 → \[**Trigger: any committee member clicks final action, after majority vote logged**\] → (Borrower sees: For approval → Approved/Denied/For revision/Hold)  
 Negotiation (if needed)  
 → \[**Trigger: borrower signs (possibly revised) computation form**\] → (Borrower sees: Negotiating / Awaiting confirmation)  
 LRA Documentation  
 → \[**Trigger: all loan documents signed by borrower**\] → (Borrower sees: For release / blocked by \[X\])  
 Collection Head Briefing  
 → \[**Trigger: briefing sign-off/checklist completed in system**\] →  
 Loan Release (check)  
 → \[**Trigger: signed Check Voucher uploaded & transmitted to main branch**\] → (Borrower sees: Released)  
 Transaction Closed → Accounting  
 → \[**Trigger: closed file received by AR in system**\] → (Borrower sees: Loan active, balance, schedule)  
 Masterlist Update & Collector Assignment  
 → \[**Trigger: ongoing daily monitoring once assigned**\]  
 Payment Monitoring — Borrower uploads proof of payment  
 → \[**Trigger: DCR submitted in system**\] →  
 AR Reconciliation  
 → \[**Trigger: payment matched against bank deposit**\] → (Borrower sees: Paid)  
 → \[Trigger: 90-day aging threshold\] →  
 Remedial/Paralegal Turnover

---

### **Key Control Points**

1. **Before CIG endorsement:** File must be complete in the system — incomplete files cannot be endorsed; CSA must record why a file is held.  
2. **Before Committee submission:** CIG's verification form must be fully completed in the system, regardless of positive/negative findings; CIG has no denial authority.  
3. **Before any Committee outcome takes effect:** A majority vote (2/3) alone is informational only — one of the 3 committee members must still perform the explicit final-action click for Approve, Deny, Notice to Revisit, or Hold to actually take effect.  
4. **Before LRA documentation:** Borrower must sign the (possibly revised, post-negotiation) computation form — this is the formal trigger, not verbal agreement alone.  
5. **Before check release:** Collection Head briefing must have a documented sign-off in the system, and all loan documents must be signed.  
6. **Before transaction closure:** Signed Check Voucher must be uploaded and transmitted to the main branch through the system.  
7. **Before "Paid" status:** AR must confirm a borrower-uploaded payment proof actually matches a real bank deposit — an upload alone does not trigger "Paid" status.  
8. **Reopening/revision rule:** Files can only be revised via CSA (before "Endorse to CIG") or via a Committee-issued Notice to Revisit; once a file reaches LRA, all documents lock permanently.  
9. **Borrower visibility boundary:** Borrower sees status labels and blockers at every stage, but not internal content — e.g., not CIG's verification notes, not Committee's internal votes/comments, not LRA's finalized confidential documents. Only the resulting status and any specific blocking requirement are surfaced. *(This boundary is an inference based on the access-control pattern established elsewhere in the meeting, not an explicit statement — flag it if borrower visibility should go deeper at any stage.)*  
   ---

### **Appendix: System / Dashboard Requirements**

**Role-based dashboards** — Each role (Borrower, Agent, CSA, CIG, Committee, LRA, AR, Collector/Account Manager, Remedial/Paralegal Collector) has its own dashboard scoped to only what that role needs to see or act on. LRA and CSA are separate logins even when the same person holds both roles.

**Borrower portal** — self-registration; system-assigned Borrower Number; document upload; real-time status visibility at every stage (with specific blocker detail at the LRA/release stage); proof-of-payment upload during Collection; loan history and balance view.

**Agent/Marketing portal** — self-registration; lead name \+ business name input; document upload on borrower's behalf or borrower self-upload; completion status visibility only (no document access) for commission tracking.

**Committee voting mechanism** — individual votes from all 3 members logged with timestamps; majority tally shown as informational status only; separate, explicit final-action click (by any of the 3\) required to actually finalize Approve/Deny/Notice to Revisit/Hold and move the file forward.

**Notice to Revisit / revision tracking** — Committee-flagged revisions appear on the relevant role's dashboard with the specific comment/reason and a turnaround-time tracker, visible in summary form to the borrower as well.

**Collector/Account Manager dashboard** — Shows only assigned borrowers, filterable by due date; updates automatically when AR posts a payment as confirmed; maintains call/contact history and scheduled callback dates; payment entry/review happens directly in-system.

**Reporting needs** — Aging reports (30/60/90-day), income recognition / interest and penalty collected, collection performance reports (including turnaround time per step), executive/management dashboard.

**Penalty configuration** — Penalty rate (e.g., 5%) and other thresholds are system-configurable, not hardcoded.

