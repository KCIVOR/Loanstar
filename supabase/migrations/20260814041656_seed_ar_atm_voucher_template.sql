-- Seed AR ATM Voucher template for LRA auto-generation on without_pdc (ATM Surrender).
-- Cloned from live published ar_cash_voucher body; heading only changed to AR ATM VOUCHER.
-- Leaves ar_cash_voucher template in place for historical generated_documents.

WITH t AS (
  INSERT INTO public.document_templates (slug, name, description, category)
  VALUES (
    'ar_atm_voucher',
    'AR ATM Voucher',
    'Accounting ATM voucher for AR posting (ATM Surrender / without-PDC path)',
    'release'
  )
  RETURNING id
)
INSERT INTO public.document_template_versions (template_id, version_no, body, merge_fields, status, published_at)
SELECT
  id,
  1,
  $body$
<div style="text-align:center"><h2>{{companyName}}</h2></div>
<h3 style="text-align:center">AR ATM VOUCHER</h3>
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
$body$,
  '[]'::jsonb,
  'published',
  now()
FROM t;
