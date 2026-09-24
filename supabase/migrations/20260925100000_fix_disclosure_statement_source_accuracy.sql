-- Disclosure Statement accuracy pass, redone against a true visual comparison
-- (the actual SFCalculator/DISC.doc source converted to PDF via Word COM
-- automation and rasterized, not just antiword/python-docx text extraction —
-- the earlier promotions in this project only verified wording, not layout).
--
-- Three real discrepancies found against the source image:
--
--   1. Title ("DISCLOSURE STATEMENT OF LOAN/CREDIT TRANSACTION") and its
--      subtitle ("As required under R.A. 3765...") were centered
--      (`data-align="center"`); the source has them left-aligned, sitting to
--      the left of the letterhead logo, not centered under it.
--   2. The interest-type/term checkbox block ("( ) Simple / ( ) Compound"
--      paired with "( ) 6 months+ / 9 months / 12 months / Others") was
--      crammed into 2 rows, with the second row running all four
--      month-option checkboxes together on one line. The source lays this
--      out as 4 separate rows (2 columns x 4 rows) — Simple/6 months+,
--      Compound/9 months, then 12 months and Others each on their own row
--      with a blank left column. Rebuilt as 4 rows; the second column's
--      exact horizontal tab-stop position from the source .doc can't be
--      reproduced pixel-for-pixel under this schema (`<td>` content is
--      inline-only, so a true nested 2-column sub-grid isn't available —
--      see extensions.ts's comment on table cells), so the second phrase on
--      each row is positioned with `&nbsp;` padding as a best-effort visual
--      approximation, not an exact tab-stop match.
--   3. "NOTICE TO BORROWER: YOU ARE ENTITLED TO A COPY OF THIS PAPER WHICH
--      YOU WILL SIGN" was centered; the source has it left-aligned, flush
--      with the page margin like the rest of the body text.
--
-- Left deliberately unresolved, not silently changed: the source's own
-- acknowledgment paragraph reads "...PRIOR TO THE CONSUMMATION OF THE CREDIT
-- DTRANSACTION..." (stray leading "D" on TRANSACTION, apparently a typo in
-- the original .doc). This body keeps the correct spelling rather than
-- reproducing the source's own typo — flagged for the client to confirm,
-- not auto-matched, per the design doc's "don't reinterpret content, record
-- inconsistencies for confirmation" rule.
--
-- See tiptap-roundtrip.test.mts: disclosure_statement_source_faithful, and
-- disclosure-promotion-migration.test.mts (now points at this migration).
-- Idempotent: archives the current published body only if different, then
-- inserts the reviewed body as a new published version only if not already
-- present verbatim. Never applied automatically.

WITH reviewed_body AS (
  SELECT $disc2$
<div data-accurate data-document-footer="none">
<div data-align="right"><img class="doc-logo" src="logo.png" alt="Loan Star Lending Group Corp." width="160"></div>
<h2>DISCLOSURE STATEMENT OF LOAN/CREDIT TRANSACTION</h2>
<p>(As required under R.A. 3765, Truth in Lending Act)</p>

<table data-plain><tbody>
<tr><td>Name of Borrower</td><td>:</td><td data-underline>{{borrowerName}}<span data-if="coBorrowerName"> and {{coBorrowerName}}</span></td></tr>
<tr><td>Name of Company</td><td>:</td><td data-underline>{{businessCompanyName}}</td></tr>
<tr><td>Address</td><td>:</td><td data-underline>{{address}}</td></tr>
</tbody></table>

<table data-plain><tbody>
<tr><td>1. Amount to be Financed</td><td data-align="center">PHP</td><td data-align="right" data-underline>{{amountFinanced}}</td></tr>
<tr><td>2. Less: Down payment and/or Trade-in Value</td><td></td><td data-underline>&nbsp;</td></tr>
<tr><td>3. Unpaid Balance of Cash/Purchase Price or Net Proceeds of loan</td><td></td><td data-underline>&nbsp;</td></tr>
<tr><td>4. Non-Finance Charges</td><td></td><td></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;a. Security Fee</td><td></td><td data-align="right" data-underline>{{securityFee}}</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;b. Taxes</td><td></td><td data-underline>&nbsp;</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;c. Processing Fee</td><td></td><td data-align="right" data-underline>{{processingFee}}</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;d. Other Loan</td><td></td><td data-underline>&nbsp;</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;e. Notarial Fee</td><td></td><td data-align="right" data-underline>{{notaryFee}}</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;f. Payment for Previous Loan</td><td></td><td data-underline>&nbsp;</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;g. Advance Payment</td><td></td><td data-underline>&nbsp;</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;h. Documentary Stamp</td><td></td><td data-align="right" data-underline>{{docStamp}}</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;i. Bank Account Opening</td><td></td><td data-underline>&nbsp;</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;j. Admin Cost</td><td></td><td data-align="right" data-underline>{{adminCost}}</td></tr>
<tr><td><b>&nbsp;&nbsp;&nbsp;Total Non-Finance charges</b></td><td data-align="center">Php</td><td data-align="right" data-underline>{{nonFinanceCharges}}</td></tr>
<tr><td>5. Cash/Purchase Price</td><td data-align="center">Php</td><td data-align="right" data-underline>{{netLoanAmount}}</td></tr>
<tr><td>6. Finance Charges</td><td></td><td></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;a. Interest: <u>{{interestRate}}</u> p.m. From <u>{{disclosureFromDate}}</u> to <u>{{disclosureToDate}}</u> ({{installmentCount}} months)</td><td data-align="center">Php</td><td data-align="right" data-underline>{{financeChargeInterest}}</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;( ) Simple &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;( ) 6 months+</td><td></td><td></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;( ) Compound &nbsp;&nbsp;&nbsp;( ) 9 months</td><td></td><td></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;( ) 12 months</td><td></td><td></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;( ) Others ____________</td><td></td><td></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;b. Discounts</td><td></td><td data-underline>&nbsp;</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;c. Service/handling charges</td><td></td><td data-underline>&nbsp;</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;d. Collection Charges</td><td></td><td data-underline>&nbsp;</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;e. Credit Investigation Fees</td><td></td><td data-underline>&nbsp;</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;f. Appraisal Fees</td><td></td><td data-underline>&nbsp;</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;g. Attorney's/Legal Fees</td><td></td><td data-underline>&nbsp;</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;h. Other Charges Incident to the Extension of credit (specify)</td><td></td><td data-underline>&nbsp;</td></tr>
<tr><td><b>&nbsp;&nbsp;&nbsp;Total Finance Charge</b></td><td></td><td data-underline>&nbsp;</td></tr>
<tr><td>7. Percentage of Finance Charges to Total Amount Financed (Computed in accordance with Sec. 2 (I) of CB Circular 158)</td><td></td><td data-align="right" data-underline>%</td></tr>
<tr><td>8. Effective Interest Rate</td><td></td><td data-align="right" data-underline>%</td></tr>
<tr><td>9. Payment</td><td></td><td></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;a. Single Payment Due ______________________________</td><td></td><td></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;b. Total Installment Payments (Payable in <u>{{installmentCount}}</u> months at Php <u>{{monthlyAmortization}}</u>)</td><td></td><td data-align="right" data-underline>{{totalInstallmentPayments}}</td></tr>
<tr><td>10. Additional Charges in case certain stipulations in the contract are not met by the debtor</td><td></td><td></td></tr>
</tbody></table>

<table data-plain><tbody>
<tr><th data-align="center">Nature</th><th data-align="center">Rate</th><th data-align="center">Amount</th></tr>
<tr><td data-underline>&nbsp;</td><td data-underline>&nbsp;</td><td data-underline>&nbsp;</td></tr>
<tr><td data-underline>&nbsp;</td><td data-underline>&nbsp;</td><td data-underline>&nbsp;</td></tr>
</tbody></table>

<p data-align="center">CERTIFIED CORRECT:</p>
<p data-align="center">____________________________<br/><b>{{lenderRepresentative}}</b><br/>Authorized Signatory<br/>{{lenderRepresentativeTitle}}<br/>Position</p>

<p>I ACKNOWLEDGE RECEIPT OF A COPY OF THIS STATEMENT PRIOR TO THE CONSUMMATION OF THE CREDIT TRANSACTION AND THAT I UNDERSTAND AND FULLY AGREE TO THE TERMS AND CONDITIONS THEREOF:</p>

<table data-plain><tbody>
<tr><td data-align="center">____________________________<br/><b>{{borrowerName}}</b><br/>Borrower Signature Over Printed Name</td><td data-align="center">____________________________<br/><b>{{todayDate}}</b><br/>Date</td></tr>
<tr><td data-align="center">____________________________<br/><b>{{coBorrowerName}}</b><br/>Co-Borrower Signature Over Printed Name</td><td data-align="center">____________________________<br/><b>{{todayDate}}</b><br/>Date</td></tr>
</tbody></table>

<p>NOTICE TO BORROWER: YOU ARE ENTITLED TO A COPY OF THIS PAPER WHICH YOU WILL SIGN</p>
</div>
$disc2$::text AS body
)
UPDATE public.document_template_versions v SET status = 'archived'
  FROM public.document_templates t, reviewed_body b
 WHERE v.template_id = t.id
   AND t.slug = 'disclosure_statement'
   AND v.status = 'published'
   AND v.body IS DISTINCT FROM b.body;

WITH reviewed_body AS (
  SELECT $disc2$
<div data-accurate data-document-footer="none">
<div data-align="right"><img class="doc-logo" src="logo.png" alt="Loan Star Lending Group Corp." width="160"></div>
<h2>DISCLOSURE STATEMENT OF LOAN/CREDIT TRANSACTION</h2>
<p>(As required under R.A. 3765, Truth in Lending Act)</p>

<table data-plain><tbody>
<tr><td>Name of Borrower</td><td>:</td><td data-underline>{{borrowerName}}<span data-if="coBorrowerName"> and {{coBorrowerName}}</span></td></tr>
<tr><td>Name of Company</td><td>:</td><td data-underline>{{businessCompanyName}}</td></tr>
<tr><td>Address</td><td>:</td><td data-underline>{{address}}</td></tr>
</tbody></table>

<table data-plain><tbody>
<tr><td>1. Amount to be Financed</td><td data-align="center">PHP</td><td data-align="right" data-underline>{{amountFinanced}}</td></tr>
<tr><td>2. Less: Down payment and/or Trade-in Value</td><td></td><td data-underline>&nbsp;</td></tr>
<tr><td>3. Unpaid Balance of Cash/Purchase Price or Net Proceeds of loan</td><td></td><td data-underline>&nbsp;</td></tr>
<tr><td>4. Non-Finance Charges</td><td></td><td></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;a. Security Fee</td><td></td><td data-align="right" data-underline>{{securityFee}}</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;b. Taxes</td><td></td><td data-underline>&nbsp;</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;c. Processing Fee</td><td></td><td data-align="right" data-underline>{{processingFee}}</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;d. Other Loan</td><td></td><td data-underline>&nbsp;</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;e. Notarial Fee</td><td></td><td data-align="right" data-underline>{{notaryFee}}</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;f. Payment for Previous Loan</td><td></td><td data-underline>&nbsp;</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;g. Advance Payment</td><td></td><td data-underline>&nbsp;</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;h. Documentary Stamp</td><td></td><td data-align="right" data-underline>{{docStamp}}</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;i. Bank Account Opening</td><td></td><td data-underline>&nbsp;</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;j. Admin Cost</td><td></td><td data-align="right" data-underline>{{adminCost}}</td></tr>
<tr><td><b>&nbsp;&nbsp;&nbsp;Total Non-Finance charges</b></td><td data-align="center">Php</td><td data-align="right" data-underline>{{nonFinanceCharges}}</td></tr>
<tr><td>5. Cash/Purchase Price</td><td data-align="center">Php</td><td data-align="right" data-underline>{{netLoanAmount}}</td></tr>
<tr><td>6. Finance Charges</td><td></td><td></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;a. Interest: <u>{{interestRate}}</u> p.m. From <u>{{disclosureFromDate}}</u> to <u>{{disclosureToDate}}</u> ({{installmentCount}} months)</td><td data-align="center">Php</td><td data-align="right" data-underline>{{financeChargeInterest}}</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;( ) Simple &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;( ) 6 months+</td><td></td><td></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;( ) Compound &nbsp;&nbsp;&nbsp;( ) 9 months</td><td></td><td></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;( ) 12 months</td><td></td><td></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;( ) Others ____________</td><td></td><td></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;b. Discounts</td><td></td><td data-underline>&nbsp;</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;c. Service/handling charges</td><td></td><td data-underline>&nbsp;</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;d. Collection Charges</td><td></td><td data-underline>&nbsp;</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;e. Credit Investigation Fees</td><td></td><td data-underline>&nbsp;</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;f. Appraisal Fees</td><td></td><td data-underline>&nbsp;</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;g. Attorney's/Legal Fees</td><td></td><td data-underline>&nbsp;</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;h. Other Charges Incident to the Extension of credit (specify)</td><td></td><td data-underline>&nbsp;</td></tr>
<tr><td><b>&nbsp;&nbsp;&nbsp;Total Finance Charge</b></td><td></td><td data-underline>&nbsp;</td></tr>
<tr><td>7. Percentage of Finance Charges to Total Amount Financed (Computed in accordance with Sec. 2 (I) of CB Circular 158)</td><td></td><td data-align="right" data-underline>%</td></tr>
<tr><td>8. Effective Interest Rate</td><td></td><td data-align="right" data-underline>%</td></tr>
<tr><td>9. Payment</td><td></td><td></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;a. Single Payment Due ______________________________</td><td></td><td></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;b. Total Installment Payments (Payable in <u>{{installmentCount}}</u> months at Php <u>{{monthlyAmortization}}</u>)</td><td></td><td data-align="right" data-underline>{{totalInstallmentPayments}}</td></tr>
<tr><td>10. Additional Charges in case certain stipulations in the contract are not met by the debtor</td><td></td><td></td></tr>
</tbody></table>

<table data-plain><tbody>
<tr><th data-align="center">Nature</th><th data-align="center">Rate</th><th data-align="center">Amount</th></tr>
<tr><td data-underline>&nbsp;</td><td data-underline>&nbsp;</td><td data-underline>&nbsp;</td></tr>
<tr><td data-underline>&nbsp;</td><td data-underline>&nbsp;</td><td data-underline>&nbsp;</td></tr>
</tbody></table>

<p data-align="center">CERTIFIED CORRECT:</p>
<p data-align="center">____________________________<br/><b>{{lenderRepresentative}}</b><br/>Authorized Signatory<br/>{{lenderRepresentativeTitle}}<br/>Position</p>

<p>I ACKNOWLEDGE RECEIPT OF A COPY OF THIS STATEMENT PRIOR TO THE CONSUMMATION OF THE CREDIT TRANSACTION AND THAT I UNDERSTAND AND FULLY AGREE TO THE TERMS AND CONDITIONS THEREOF:</p>

<table data-plain><tbody>
<tr><td data-align="center">____________________________<br/><b>{{borrowerName}}</b><br/>Borrower Signature Over Printed Name</td><td data-align="center">____________________________<br/><b>{{todayDate}}</b><br/>Date</td></tr>
<tr><td data-align="center">____________________________<br/><b>{{coBorrowerName}}</b><br/>Co-Borrower Signature Over Printed Name</td><td data-align="center">____________________________<br/><b>{{todayDate}}</b><br/>Date</td></tr>
</tbody></table>

<p>NOTICE TO BORROWER: YOU ARE ENTITLED TO A COPY OF THIS PAPER WHICH YOU WILL SIGN</p>
</div>
$disc2$::text AS body
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT t.id,
       COALESCE((SELECT MAX(version_no) FROM public.document_template_versions WHERE template_id = t.id), 0) + 1,
       b.body,
       'published',
       now()
  FROM public.document_templates t
 CROSS JOIN reviewed_body b
 WHERE t.slug = 'disclosure_statement'
   AND NOT EXISTS (
     SELECT 1 FROM public.document_template_versions v
      WHERE v.template_id = t.id AND v.body = b.body
   );
