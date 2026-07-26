-- ===========================================================================
-- Phase 4 (increment 1) — seed the 4 voucher templates, published as v1.
--
-- See docs/document-template-system-plan.md §4 "Phase 4". Generation
-- (generateReleaseDocuments) now prefers a published template per slug and
-- falls back to the legacy hardcoded renderer, so seeding these switches the
-- vouchers onto the template engine. Bodies capture all voucher DATA
-- (borrower, amounts, double-entry accounting, signatures); visual polish is
-- refined by superadmins in the editor. Merge keys match
-- src/lib/lra/template-context.ts + src/lib/documents/templates/fields.ts.
--
-- Dollar-quoted bodies avoid single-quote escaping. version_no=1, published.
-- ===========================================================================

WITH t AS (
  INSERT INTO public.document_templates (slug, name, description, category)
  VALUES ('check_voucher', 'Check Voucher',
          'Disbursement check voucher (with-PDC release path)', 'release')
  RETURNING id
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT id, 1, $body$
<div style="text-align:center"><h2>{{companyName}}</h2></div>
<p style="text-align:center">4th Floor, Carson Building, Orense St. Corner Del Carmen St., Guadalupe Nuevo, 1212 Makati City, Philippines</p>
<table><tbody><tr>
<td><b>PHP {{checkAmount}}</b></td>
<td style="text-align:right"><b>CHECK VOUCHER</b></td>
</tr></tbody></table>
<p><b>Date:</b> {{dateReleased}}</p>
<table><tbody>
<tr><td><b>BORROWER:</b> {{borrowerName}}</td><td><b>ADDRESS:</b> {{address}}</td></tr>
</tbody></table>
<p><b>DETAILS OF PAYMENT:</b> SEAFARER LOAN &ndash; {{loanAccountNo}}</p>
<table><tbody>
<tr><th>Bank Name</th><th>Account No.</th><th>Check No.</th><th>Check Amount</th><th>Date</th></tr>
<tr><td>{{bankName}}</td><td>{{bankAccountNo}}</td><td>{{checkNumber}}</td><td>{{checkAmount}}</td><td>{{dateReleased}}</td></tr>
</tbody></table>
<p><b>Amount in Words:</b> {{amountInWords}}</p>
<table><tbody>
<tr><th>Account Description</th><th>Account Code</th><th>Debit</th><th>Credit</th></tr>
<tr data-repeat="accountingEntries"><td>{{description}}</td><td>{{accountCode}}</td><td>{{debit}}</td><td>{{credit}}</td></tr>
</tbody></table>
<p>Received from {{companyName}} the amount of <b>{{amountInWords}}</b> in full payment of the above account.</p>
<table><tbody><tr>
<td><b>Prepared by:</b> {{preparedBy}}</td><td><b>Checked by:</b> {{checkedBy}}</td><td><b>Approved by:</b> {{approvedBy}}</td>
</tr></tbody></table>
<p>&nbsp;</p>
<p>Received by: ____________________________<br/>{{borrowerName}} &mdash; Borrower</p>
$body$, 'published', now()
FROM t;

WITH t AS (
  INSERT INTO public.document_templates (slug, name, description, category)
  VALUES ('cash_voucher', 'Cash Voucher',
          'Disbursement cash voucher (without-PDC release path)', 'release')
  RETURNING id
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT id, 1, $body$
<div style="text-align:center"><h2>{{companyName}}</h2></div>
<p style="text-align:center">4th Floor, Carson Building, Orense St. Corner Del Carmen St., Guadalupe Nuevo, 1212 Makati City, Philippines</p>
<table><tbody><tr>
<td><b>PHP {{netLoanAmount}}</b></td>
<td style="text-align:right"><b>CASH VOUCHER</b></td>
</tr></tbody></table>
<p><b>Date:</b> {{dateReleased}}</p>
<table><tbody>
<tr><td><b>BORROWER:</b> {{borrowerName}}</td><td><b>ADDRESS:</b> {{address}}</td></tr>
</tbody></table>
<p><b>DETAILS OF PAYMENT:</b> SEAFARER LOAN &ndash; {{loanAccountNo}}</p>
<table><tbody>
<tr><th>Bank Name</th><th>Account No.</th><th>Check No.</th><th>Cash Amount</th><th>Date</th></tr>
<tr><td>CASH</td><td>N/A</td><td>N/A</td><td>{{netLoanAmount}}</td><td>{{dateReleased}}</td></tr>
</tbody></table>
<p><b>Amount in Words:</b> {{amountInWords}}</p>
<table><tbody>
<tr><th>Account Description</th><th>Account Code</th><th>Debit</th><th>Credit</th></tr>
<tr data-repeat="accountingEntries"><td>{{description}}</td><td>{{accountCode}}</td><td>{{debit}}</td><td>{{credit}}</td></tr>
</tbody></table>
<p>Received from {{companyName}} the amount of <b>{{amountInWords}}</b> in full payment of the above account.</p>
<table><tbody><tr>
<td><b>Prepared by:</b> {{preparedBy}}</td><td><b>Checked by:</b> {{checkedBy}}</td><td><b>Approved by:</b> {{approvedBy}}</td>
</tr></tbody></table>
<p>&nbsp;</p>
<p>Received by: ____________________________<br/>{{borrowerName}} &mdash; Borrower</p>
$body$, 'published', now()
FROM t;

WITH t AS (
  INSERT INTO public.document_templates (slug, name, description, category)
  VALUES ('ar_check_voucher', 'AR Check Voucher',
          'Accounting check voucher for AR posting (with-PDC path)', 'release')
  RETURNING id
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT id, 1, $body$
<div style="text-align:center"><h2>{{companyName}}</h2></div>
<h3 style="text-align:center">AR CHECK VOUCHER</h3>
<p><b>Borrower:</b> {{borrowerName}} ({{borrowerNo}})</p>
<p><b>Loan Account No.:</b> {{loanAccountNo}}</p>
<p><b>Amount:</b> {{netLoanAmount}} &mdash; {{amountInWords}}</p>
<p><b>Date:</b> {{dateReleased}}</p>
<table><tbody>
<tr><th>Account Description</th><th>Account Code</th><th>Debit</th><th>Credit</th></tr>
<tr data-repeat="accountingEntries"><td>{{description}}</td><td>{{accountCode}}</td><td>{{debit}}</td><td>{{credit}}</td></tr>
</tbody></table>
<p>&nbsp;</p>
<table><tbody><tr>
<td><b>Prepared by:</b> {{preparedBy}}</td><td><b>Checked by:</b> {{checkedBy}}</td><td><b>Approved by:</b> {{approvedBy}}</td>
</tr></tbody></table>
$body$, 'published', now()
FROM t;

WITH t AS (
  INSERT INTO public.document_templates (slug, name, description, category)
  VALUES ('ar_cash_voucher', 'AR Cash Voucher',
          'Accounting cash voucher for AR posting (without-PDC path)', 'release')
  RETURNING id
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT id, 1, $body$
<div style="text-align:center"><h2>{{companyName}}</h2></div>
<h3 style="text-align:center">AR CASH VOUCHER</h3>
<p><b>Borrower:</b> {{borrowerName}} ({{borrowerNo}})</p>
<p><b>Loan Account No.:</b> {{loanAccountNo}}</p>
<p><b>Amount:</b> {{netLoanAmount}} &mdash; {{amountInWords}}</p>
<p><b>Date:</b> {{dateReleased}}</p>
<table><tbody>
<tr><th>Account Description</th><th>Account Code</th><th>Debit</th><th>Credit</th></tr>
<tr data-repeat="accountingEntries"><td>{{description}}</td><td>{{accountCode}}</td><td>{{debit}}</td><td>{{credit}}</td></tr>
</tbody></table>
<p>&nbsp;</p>
<table><tbody><tr>
<td><b>Prepared by:</b> {{preparedBy}}</td><td><b>Checked by:</b> {{checkedBy}}</td><td><b>Approved by:</b> {{approvedBy}}</td>
</tr></tbody></table>
$body$, 'published', now()
FROM t;
