-- ===========================================================================
-- Phase 6 (increment 1) — seed the 5 NEW document templates.
--
-- See docs/document-template-system-plan.md §4 "Phase 6". These are the
-- documents that did NOT exist in the legacy hardcoded renderer:
--   demand_letter, acknowledgement_receipt, endorsement_letter,
--   final_computation_sheet, application_form.
--
-- Additive & DORMANT: no stage generates these yet (generation is wired in a
-- later Phase 6 increment via renderAndStore). Seeding them now makes each
-- authorable + previewable in the editor and gives renderAndStore a published
-- template to resolve once wiring lands.
--
-- Bodies are BEST-GUESS drafts (the plan sanctions this — refine in the editor).
-- Merge keys reuse src/lib/documents/templates/fields.ts where possible; new
-- keys are documented per-template below and become the generator contract.
--
-- Publish state:
--   * 4 published as v1 (immediately resolvable by renderAndStore).
--   * endorsement_letter is seeded as a DRAFT — the plan flags it "needs Legal
--     review" before going live, so getPublishedTemplate returns null until a
--     superadmin publishes it.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Demand Letter (collection/remedial) — the highest-risk gap.
-- Parameterized as a SERIES via {{demandStage}} (e.g. "FIRST REMINDER",
-- "SECOND DEMAND", "FINAL DEMAND") + an `isFinal` flag that reveals the
-- legal-action clause. One template body serves the whole escalation ladder.
-- New keys: demandStage, outstandingBalance, penaltyAmount, totalAmountDue,
--   amountInWords, daysPastDue, dueDate, paymentDeadline, isFinal.
-- ---------------------------------------------------------------------------
WITH t AS (
  INSERT INTO public.document_templates (slug, name, description, category)
  VALUES ('demand_letter', 'Demand Letter',
          'Collection demand letter; parameterized for the reminder/demand/final series via demandStage + isFinal.',
          'collection')
  RETURNING id
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT id, 1, $body$
<div style="text-align:center"><h2>{{companyName}}</h2></div>
<p style="text-align:center">4th Floor, Carson Building, Orense St. Corner Del Carmen St., Guadalupe Nuevo, 1212 Makati City, Philippines</p>
<p style="text-align:right">{{todayDate}}</p>
<p><b>{{borrowerName}}</b><br/>{{address}}</p>
<p><b>RE: {{demandStage}} &mdash; Loan Account No. {{loanAccountNo}}</b></p>
<p>Dear {{borrowerName}},</p>
<p>Our records show that your account is past due by <b>{{daysPastDue}} day(s)</b> as of {{todayDate}}. The amount due on {{dueDate}} remains unsettled.</p>
<table><tbody>
<tr><th>Outstanding Balance</th><td style="text-align:right">PHP {{outstandingBalance}}</td></tr>
<tr><th>Penalty / Charges</th><td style="text-align:right">PHP {{penaltyAmount}}</td></tr>
<tr><th><b>Total Amount Due</b></th><td style="text-align:right"><b>PHP {{totalAmountDue}}</b></td></tr>
</tbody></table>
<p>(<b>{{amountInWords}}</b>)</p>
<p>We respectfully demand that you settle the total amount due on or before <b>{{paymentDeadline}}</b>.</p>
<p data-if="isFinal"><b>Please be advised that this is our FINAL DEMAND.</b> Should you fail to settle within the period stated, we shall be constrained to pursue the appropriate legal action to protect the interest of the company, without further notice.</p>
<p>Kindly disregard this notice if payment has already been made.</p>
<p>Very truly yours,</p>
<p>&nbsp;</p>
<p>____________________________<br/>{{companyName}}<br/>Collection Department</p>
$body$, 'published', now()
FROM t;

-- ---------------------------------------------------------------------------
-- Acknowledgement Receipt (release) — check/cash variants via isCheck/isCash.
-- Confirms the borrower received the released funds.
-- New keys: amountReleased (reuses amountInWords, bankName, checkNumber, checkDate).
-- ---------------------------------------------------------------------------
WITH t AS (
  INSERT INTO public.document_templates (slug, name, description, category)
  VALUES ('acknowledgement_receipt', 'Acknowledgement Receipt',
          'Borrower acknowledgement of funds received at release; check/cash conditional.',
          'release')
  RETURNING id
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT id, 1, $body$
<div style="text-align:center"><h2>{{companyName}}</h2></div>
<h3 style="text-align:center">ACKNOWLEDGEMENT RECEIPT</h3>
<p style="text-align:right">{{todayDate}}</p>
<p>This is to acknowledge that I, <b>{{borrowerName}}</b>, of {{address}}, have received from <b>{{companyName}}</b> the amount of <b>{{amountInWords}} (PHP {{amountReleased}})</b><span data-if="isCheck">, issued through {{bankName}} check no. {{checkNumber}} dated {{checkDate}}</span><span data-if="isCash"> in cash</span>, representing the net proceeds of my loan under account no. {{loanAccountNo}}.</p>
<p>I confirm that the said amount was received in full and in good order.</p>
<p>&nbsp;</p>
<p>____________________________<br/>{{borrowerName}} &mdash; Borrower</p>
$body$, 'published', now()
FROM t;

-- ---------------------------------------------------------------------------
-- Endorsement Letter (LRA) — seeded as DRAFT (needs Legal review before live).
-- New keys: endorsedTo, endorsementPurpose.
-- ---------------------------------------------------------------------------
WITH t AS (
  INSERT INTO public.document_templates (slug, name, description, category)
  VALUES ('endorsement_letter', 'Endorsement Letter',
          'LRA endorsement letter. DRAFT until Legal confirms the wording.',
          'release')
  RETURNING id
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status)
SELECT id, 1, $body$
<div style="text-align:center"><h2>{{companyName}}</h2></div>
<h3 style="text-align:center">ENDORSEMENT LETTER</h3>
<p style="text-align:right">{{todayDate}}</p>
<p><b>{{endorsedTo}}</b></p>
<p>Dear Sir/Madam,</p>
<p>We respectfully endorse the loan account of <b>{{borrowerName}}</b> (Account No. {{loanAccountNo}}), with a net released amount of <b>PHP {{netLoanAmount}}</b>, for the purpose of {{endorsementPurpose}}.</p>
<p>Your assistance in this matter is highly appreciated.</p>
<p>Very truly yours,</p>
<p>&nbsp;</p>
<p>____________________________<br/>{{companyName}}</p>
$body$, 'draft'
FROM t;

-- ---------------------------------------------------------------------------
-- Final Computation Sheet (bridge/LRA) — original-vs-renegotiated two columns.
-- Collection `computationRows`: { label, original, renegotiated }.
-- New keys: preparedBy, checkedBy, approvedBy (reused) + computationRows.
-- ---------------------------------------------------------------------------
WITH t AS (
  INSERT INTO public.document_templates (slug, name, description, category)
  VALUES ('final_computation_sheet', 'Final Computation Sheet',
          'Original-vs-renegotiated final computation summary.',
          'computation')
  RETURNING id
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT id, 1, $body$
<div style="text-align:center"><h2>{{companyName}}</h2></div>
<h3 style="text-align:center">FINAL COMPUTATION SHEET</h3>
<p style="text-align:right">{{todayDate}}</p>
<p><b>Borrower:</b> {{borrowerName}} ({{borrowerNo}})<br/>
<b>Loan Account No.:</b> {{loanAccountNo}} &mdash; {{loanType}}</p>
<table><tbody>
<tr><th>Particulars</th><th style="text-align:right">Original</th><th style="text-align:right">Renegotiated</th></tr>
<tr data-repeat="computationRows"><td>{{label}}</td><td style="text-align:right">{{original}}</td><td style="text-align:right">{{renegotiated}}</td></tr>
</tbody></table>
<p>&nbsp;</p>
<table><tbody><tr>
<td><b>Prepared by:</b> {{preparedBy}}</td><td><b>Checked by:</b> {{checkedBy}}</td><td><b>Approved by:</b> {{approvedBy}}</td>
</tr></tbody></table>
$body$, 'published', now()
FROM t;

-- ---------------------------------------------------------------------------
-- Application Form (intake) — printable version only. The borrower self-service
-- CAPTURE is a separate workstream (borrower-portal fields), not this template.
-- Reuses borrower/loan keys; adds applicationNo, applicationDate.
-- ---------------------------------------------------------------------------
WITH t AS (
  INSERT INTO public.document_templates (slug, name, description, category)
  VALUES ('application_form', 'Loan Application Form',
          'Printable loan application form. Borrower self-service capture is a separate workstream.',
          'intake')
  RETURNING id
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT id, 1, $body$
<div style="text-align:center"><h2>{{companyName}}</h2></div>
<h3 style="text-align:center">LOAN APPLICATION FORM</h3>
<table><tbody>
<tr><td><b>Application No.:</b> {{applicationNo}}</td><td><b>Date:</b> {{applicationDate}}</td></tr>
</tbody></table>
<h4>Borrower Information</h4>
<table><tbody>
<tr><td><b>Name:</b> {{borrowerName}}</td><td><b>Borrower No.:</b> {{borrowerNo}}</td></tr>
<tr><td colspan="2"><b>Address:</b> {{address}}</td></tr>
<tr><td><b>Manning Agency:</b> {{manningAgency}}</td><td><b>Principal / Ship:</b> {{principalShip}}</td></tr>
</tbody></table>
<h4>Loan Requested</h4>
<table><tbody>
<tr><td><b>Loan Type:</b> {{loanType}}</td><td><b>Amount:</b> PHP {{loanAmount}}</td></tr>
<tr><td><b>Terms (months):</b> {{terms}}</td><td><b>Interest Rate:</b> {{interestRate}}</td></tr>
</tbody></table>
<p>&nbsp;</p>
<p>I certify that the information provided above is true and correct.</p>
<p>&nbsp;</p>
<p>____________________________<br/>{{borrowerName}} &mdash; Applicant</p>
$body$, 'published', now()
FROM t;
