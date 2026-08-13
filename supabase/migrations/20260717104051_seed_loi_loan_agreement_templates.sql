-- Phase 11: seed Letter of Intent + Loan Agreement as published release templates.
-- Merge keys strictly from src/lib/lra/template-context.ts.
-- Legal prose marked [DRAFT — pending Legal review] until Legal supplies final text.

-- --------------------------------------------------------------------------
-- Letter of Intent
-- --------------------------------------------------------------------------
WITH t AS (
  INSERT INTO public.document_templates (slug, name, description, category)
  VALUES (
    'letter_of_intent',
    'Letter of Intent',
    'Borrower letter of intent for the loan. DRAFT wording until Legal review.',
    'release'
  )
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name,
        description = EXCLUDED.description,
        category = EXCLUDED.category
  RETURNING id
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT id, 1, $body$
<div style="text-align:center"><h2>{{companyName}}</h2></div>
<h3 style="text-align:center">LETTER OF INTENT</h3>
<p style="text-align:right">{{todayDate}}</p>

<p><b>[DRAFT — pending Legal review]</b></p>

<p>I, <b>{{borrowerName}}</b> (Borrower No. {{borrowerNo}}), residing at {{address}}, hereby express my intent to avail of a loan from {{companyName}} under the following terms:</p>

<table><tbody>
<tr><td><b>Loan Type:</b></td><td>{{loanType}}</td></tr>
<tr><td><b>Loan Account No.:</b></td><td>{{loanAccountNo}}</td></tr>
<tr><td><b>Loan Amount (Principal):</b></td><td>Php {{loanAmount}}</td></tr>
<tr><td><b>Terms (months):</b></td><td>{{terms}}</td></tr>
<tr><td><b>Monthly Amortization:</b></td><td>Php {{monthlyAmortization}}</td></tr>
<tr><td><b>Interest Rate:</b></td><td>{{interestRate}}</td></tr>
<tr><td><b>First Payment Date:</b></td><td>{{firstPaymentDate}}</td></tr>
<tr><td><b>Payment Ends:</b></td><td>{{paymentEnds}}</td></tr>
<tr><td><b>Net Amount to be Released:</b></td><td>Php {{netLoanAmount}}</td></tr>
</tbody></table>

<p>I understand that this Letter of Intent forms part of the loan documentation package and that final loan terms are as disclosed in the Disclosure Statement and Loan Agreement.</p>

<p>&nbsp;</p>
<table><tbody><tr>
<td>____________________________<br/><b>{{borrowerName}}</b><br/>BORROWER (Signature Over Printed Name)</td>
<td>____________________________<br/>Witness / LRA Officer</td>
</tr></tbody></table>
<p><b>Date:</b> {{dateReleased}}</p>
$body$, 'published', now()
FROM t
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_template_versions v
  WHERE v.template_id = t.id AND v.version_no = 1
);

-- --------------------------------------------------------------------------
-- Loan Agreement
-- --------------------------------------------------------------------------
WITH t AS (
  INSERT INTO public.document_templates (slug, name, description, category)
  VALUES (
    'loan_agreement',
    'Loan Agreement',
    'Loan agreement between borrower and lender. DRAFT wording until Legal review.',
    'release'
  )
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name,
        description = EXCLUDED.description,
        category = EXCLUDED.category
  RETURNING id
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT id, 1, $body$
<div style="text-align:center"><h2>{{companyName}}</h2></div>
<h3 style="text-align:center">LOAN AGREEMENT</h3>
<p style="text-align:right">{{todayDate}}</p>

<p><b>[DRAFT — pending Legal review]</b> This draft is structurally complete for system generation and in-branch signing. Final legal wording will replace this section after Legal review.</p>

<p>This Loan Agreement is entered into by and between:</p>
<p><b>Lender:</b> {{companyName}}</p>
<p><b>Borrower:</b> {{borrowerName}} (Borrower No. {{borrowerNo}})<br/>
<b>Address:</b> {{address}}<br/>
<b>Manning Agency:</b> {{manningAgency}} &mdash; <b>Vessel:</b> {{principalShip}}</p>

<p><b>1. Loan Particulars</b></p>
<table><tbody>
<tr><td><b>Loan Account No.:</b></td><td>{{loanAccountNo}}</td></tr>
<tr><td><b>Loan Type:</b></td><td>{{loanType}}</td></tr>
<tr><td><b>Principal Amount:</b></td><td>Php {{principal}} ({{principalInWords}})</td></tr>
<tr><td><b>Total Loan:</b></td><td>Php {{totalLoan}} ({{totalLoanInWords}})</td></tr>
<tr><td><b>Total Interest:</b></td><td>Php {{totalInterest}}</td></tr>
<tr><td><b>Terms:</b></td><td>{{terms}} months</td></tr>
<tr><td><b>Add-on Months:</b></td><td>{{addonMonths}}</td></tr>
<tr><td><b>Interest Rate:</b></td><td>{{interestRate}}</td></tr>
<tr><td><b>Monthly Amortization:</b></td><td>Php {{monthlyAmortization}} ({{monthlyAmortizationInWords}})</td></tr>
<tr><td><b>Net Released:</b></td><td>Php {{netLoanAmount}} ({{amountInWords}})</td></tr>
<tr><td><b>Date Released:</b></td><td>{{dateReleased}}</td></tr>
<tr><td><b>First Payment:</b></td><td>{{firstPaymentDate}}</td></tr>
<tr><td><b>Payment Ends:</b></td><td>{{paymentEnds}}</td></tr>
</tbody></table>

<p><b>2. Obligations</b></p>
<p>[DRAFT — pending Legal review] The Borrower agrees to repay the loan in accordance with the amortization schedule, to issue post-dated checks or other payment instruments as required, and to comply with the Promissory Note and Disclosure Statement executed in connection with this loan.</p>

<p><b>3. Default</b></p>
<p>[DRAFT — pending Legal review] Failure to pay any installment when due, or breach of any material term of this Agreement or the Promissory Note, may render the outstanding balance immediately due and demandable, subject to applicable penalties and fees as disclosed.</p>

<p><b>4. Governing Law</b></p>
<p>[DRAFT — pending Legal review] This Agreement shall be governed by the laws of the Republic of the Philippines. Venue for actions arising hereunder may be brought in the proper courts of Makati City or elsewhere in the Philippines at the discretion of {{companyName}}.</p>

<p>&nbsp;</p>
<table><tbody><tr>
<td>____________________________<br/><b>{{borrowerName}}</b><br/>BORROWER (Signature Over Printed Name)</td>
<td>____________________________<br/>{{companyName}}<br/>Authorized Signatory</td>
</tr></tbody></table>
<p><b>Date:</b> {{dateReleased}}</p>
$body$, 'published', now()
FROM t
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_template_versions v
  WHERE v.template_id = t.id AND v.version_no = 1
);
