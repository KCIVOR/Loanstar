-- ===========================================================================
-- Phase 4 (increment 2) — seed BLRI, Promissory Note, Disclosure Statement.
--
-- Completes the 7 existing release documents on the template engine. Bodies
-- capture the real structure + data and the PN's full legal prose + notary
-- block (the PN is notarized — see plan §1.6). Merge keys match
-- src/lib/lra/template-context.ts. Visual refinement happens in the editor.
-- Un-seeded slugs already fell back to the legacy renderer; these three now
-- render from templates.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- BLRI — Borrower's Loan Released Information
-- --------------------------------------------------------------------------
WITH t AS (
  INSERT INTO public.document_templates (slug, name, description, category)
  VALUES ('blri', 'BLRI (Loan Release Information)',
          'Borrower''s Loan Released Information summary sheet', 'release')
  RETURNING id
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT id, 1, $body$
<table><tbody><tr>
<td><b>{{companyName}}</b></td>
<td style="text-align:right"><b>BORROWER NO.</b> {{borrowerNo}}</td>
</tr></tbody></table>
<div style="text-align:center"><h2>BORROWER'S LOAN RELEASED INFORMATION</h2></div>

<p><b>CLIENT INFORMATION</b></p>
<table><tbody>
<tr><td><b>Name:</b> {{borrowerName}}</td><td><b>Manning Agency:</b> {{manningAgency}}</td></tr>
<tr><td><b>Address:</b> {{address}}</td><td><b>Principal Ship:</b> {{principalShip}}</td></tr>
</tbody></table>

<p><b>LOAN ACCOUNT INFORMATION</b></p>
<table><tbody>
<tr><td><b>Loan Type:</b> {{loanType}}</td><td><b>Loan Amount:</b> {{loanAmount}}</td></tr>
<tr><td><b>Loan No.:</b> {{loanAccountNo}}</td><td><b>Terms (months):</b> {{terms}}</td></tr>
<tr><td><b>Date Released:</b> {{dateReleased}}</td><td><b>Add-on (months):</b> {{addonMonths}}</td></tr>
<tr><td><b>Payment Starts:</b> {{firstPaymentDate}}</td><td><b>Interest Rate:</b> {{interestRate}}</td></tr>
<tr><td><b>Payment Ends:</b> {{paymentEnds}}</td><td><b>Total Interest:</b> {{totalInterest}}</td></tr>
<tr><td></td><td><b>Total Loan:</b> {{totalLoan}}</td></tr>
</tbody></table>

<p><b>CHEQUE INFORMATION</b></p>
<table><tbody>
<tr><td><b>Check Voucher No.:</b> {{checkVoucherNo}}</td><td><b>Check Number:</b> {{checkNumber}}</td></tr>
<tr><td><b>Bank Name:</b> {{bankName}}</td><td><b>Check Amount:</b> {{checkAmount}}</td></tr>
<tr><td><b>Bank Account No.:</b> {{bankAccountNo}}</td><td><b>Check Date:</b> {{dateReleased}}</td></tr>
</tbody></table>

<p><b>AMORTIZATION SCHEDULE</b></p>
<table><tbody>
<tr><th>Due Date</th><th>Bank Name</th><th>Check Number</th><th>Ref Account Number</th><th>Amount</th></tr>
<tr data-repeat="pdcSchedule"><td>{{checkDate}}</td><td>{{bankName}}</td><td>{{checkNumber}}</td><td>{{refAccount}}</td><td>{{amount}}</td></tr>
</tbody></table>

<p><b>PARTICULARS</b></p>
<table><tbody>
<tr><td>Approved Loan Amount</td><td style="text-align:right">Php {{loanAmount}}</td></tr>
<tr data-repeat="particulars"><td>{{label}}</td><td style="text-align:right">{{amount}}</td></tr>
<tr><td><b>NET LOAN AMOUNT</b></td><td style="text-align:right"><b>Php {{netLoanAmount}}</b></td></tr>
</tbody></table>
<p><b>Amount in Words:</b> {{amountInWords}}</p>
<p>Received from LSLGC in full payment of the amount described above.</p>
<table><tbody>
<tr><td><b>Prepared By:</b> {{preparedBy}}</td><td><b>Received By:</b> {{borrowerName}}</td></tr>
<tr><td><b>Checked By:</b> {{checkedBy}}</td><td><b>Co-Borrower:</b></td></tr>
<tr><td><b>Approved By:</b> {{approvedBy}}</td><td><b>Date:</b> {{dateReleased}}</td></tr>
</tbody></table>
$body$, 'published', now()
FROM t;

-- --------------------------------------------------------------------------
-- Promissory Note (notarized)
-- --------------------------------------------------------------------------
WITH t AS (
  INSERT INTO public.document_templates (slug, name, description, category)
  VALUES ('promissory_note', 'Promissory Note',
          'Notarized promissory note signed in-branch by the borrower', 'release')
  RETURNING id
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT id, 1, $body$
<div style="text-align:right"><b>PN Number:</b> {{pnNumber}}</div>
<div style="text-align:center"><h2>PROMISSORY NOTE</h2></div>

<p>For value received, I/we, jointly and severally, promise to pay <b>{{companyName}}</b> or order the sum of PHILIPPINE PESOS: <b>{{principalInWords}} (Php {{principal}})</b> principal amount with an interest rate of {{interestRate}} per month or a fraction thereof for {{addonMonths}} months from {{dateReleased}} to {{paymentEnds}}. The total loan amounts to PHILIPPINE PESOS: <b>{{totalLoanInWords}} (Php {{totalLoan}})</b> payable in {{terms}} months, representing monthly amortization of PHILIPPINE PESOS: <b>{{monthlyAmortizationInWords}} (Php {{monthlyAmortization}})</b>. The payment will start on {{firstPaymentDate}} and a like amount every month thereafter until {{paymentEnds}}. I/we shall issue post-dated checks (PDCs) drawn from my/our checking bank account in the Philippines not later than {{dateReleased}}. Failure to do so constitutes a default.</p>

<p>In case of any default in payment as herein agreed, the entire balance of this note shall become immediately due and demandable, at the option of the holder. Each party to this note, whether as borrower or co-borrower, severally waives presentation of payment, demand, protest and notice of protest and dishonor of the same. A late payment charge of Five percent (5%) penalty per month or a fraction thereof on the amount due. I/We understand that I will be charged an additional of PHILIPPINE PESOS: Three Thousand Pesos (Php 3,000.00) bounce check fee on the amount due.</p>

<p>I/We understand that I/We may pre-terminate this loan agreement with {{companyName}}, provided that I/We pay the loan in full together with accrued interest thereon up to the prepayment date, including a termination fee equivalent to one (1) month's interest under this note.</p>

<p>Furthermore, I/We acknowledge that a cooling-off period is available for a duration of five (5) days following the release of the loan proceeds. Should I/We decide to cancel the loan within this period, I/We remain obligated to pay the full amount of the Processing Fee as initially disclosed and agreed upon. After the lapse of the 5-day cooling-off period, the standard pre-termination terms and fees shall apply.</p>

<p>It is further agreed by party hereto, that in case payment shall not be made for at least two (2) monthly amortizations, I/We shall pay, in addition to the aggregate of the principal amount, interest due, and penalty, the cost of collection (third-party collection), and attorney's fees in an amount based on their actual billing, but such charge in no event be less than PHILIPPINE PESOS: Three Thousand Pesos (Php 3,000.00).</p>

<p>I/We expressly agree that all legal actions arising out of this NOTE may be brought in or submitted exclusively to the jurisdiction of the proper court of Makati City or anywhere in the Philippines at the discretion of {{companyName}}. I/We acknowledge having carefully read and understood the entire promissory note prior to affixing my/our signature thereon.</p>

<p>&nbsp;</p>
<table><tbody><tr>
<td>____________________________<br/><b>{{borrowerName}}</b><br/>BORROWER (Signature Over Printed Name)</td>
<td>____________________________<br/>CO-BORROWER (Signature Over Printed Name)</td>
</tr></tbody></table>

<p>SUBSCRIBED AND SWORN TO BEFORE ME, this ______ day of ______________, 20____ affiant exhibiting to me the following:</p>
<table><tbody>
<tr><th>Name</th><th>Valid ID</th><th>Place and Date of Issue</th></tr>
<tr><td>{{borrowerName}}</td><td></td><td></td></tr>
</tbody></table>
<p>&nbsp;</p>
<table><tbody><tr>
<td>Doc. No. _______<br/>Page No. _______<br/>Book No. _______<br/>Series of _______</td>
<td style="text-align:right">____________________________<br/>NOTARY PUBLIC</td>
</tr></tbody></table>
$body$, 'published', now()
FROM t;

-- --------------------------------------------------------------------------
-- Disclosure Statement (RA 3765, Truth in Lending Act)
-- --------------------------------------------------------------------------
WITH t AS (
  INSERT INTO public.document_templates (slug, name, description, category)
  VALUES ('disclosure_statement', 'Disclosure Statement',
          'Disclosure Statement of Loan/Credit Transaction (RA 3765)', 'release')
  RETURNING id
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT id, 1, $body$
<div style="text-align:center"><h2>DISCLOSURE STATEMENT OF LOAN/CREDIT TRANSACTION</h2>
<p>(As required under R.A. 3765, Truth in Lending Act)</p></div>
<table><tbody>
<tr><td><b>Name of Borrower:</b> {{borrowerName}}</td></tr>
<tr><td><b>Name of Company:</b> {{manningAgency}}</td></tr>
<tr><td><b>Address:</b> {{address}}</td></tr>
</tbody></table>

<table><tbody>
<tr><td>1. Amount to be Financed</td><td style="text-align:right">PHP {{principal}}</td></tr>
<tr><td>2. Less: Down payment and/or Trade-in Value</td><td style="text-align:right"></td></tr>
<tr><td>3. Unpaid Balance of Cash/Purchase or Net Proceeds of loan</td><td style="text-align:right">{{netLoanAmount}}</td></tr>
<tr><td>4. Non-Finance Charges:</td><td></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;a. Security Fee</td><td style="text-align:right">{{securityFee}}</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;c. Processing Fee</td><td style="text-align:right">{{processingFee}}</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;e. Notarial Fee</td><td style="text-align:right">{{notaryFee}}</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;h. Documentary Stamp</td><td style="text-align:right">{{docStamp}}</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;j. Admin Cost</td><td style="text-align:right">{{adminCost}}</td></tr>
<tr><td>5. Cash/Purchase Price</td><td style="text-align:right">Php {{netLoanAmount}}</td></tr>
<tr><td>6. Finance Charges &mdash; Interest {{interestRate}} p.m.</td><td style="text-align:right">Php {{totalInterest}}</td></tr>
<tr><td>9. Payment &mdash; Total Installment Payments (payable in {{terms}} months at Php {{monthlyAmortization}})</td><td style="text-align:right">Php {{totalLoan}}</td></tr>
</tbody></table>

<p>&nbsp;</p>
<div style="text-align:right"><p>CERTIFIED CORRECT:</p>
<p>____________________________<br/>Authorized Signatory</p></div>

<p>I ACKNOWLEDGE RECEIPT OF A COPY OF THIS STATEMENT PRIOR TO THE CONSUMMATION OF THE CREDIT TRANSACTION AND THAT I UNDERSTAND AND FULLY AGREE TO THE TERMS AND CONDITIONS THEREOF:</p>
<p>&nbsp;</p>
<table><tbody><tr>
<td>____________________________<br/>{{borrowerName}}<br/>Borrower Signature Over Printed Name</td>
<td style="text-align:right"><b>Date:</b> {{dateReleased}}</td>
</tr></tbody></table>
<p><b>NOTICE TO BORROWER: YOU ARE ENTITLED TO A COPY OF THIS PAPER WHICH YOU WILL SIGN.</b></p>
$body$, 'published', now()
FROM t;
