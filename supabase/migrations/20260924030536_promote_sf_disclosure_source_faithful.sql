-- Promote the reviewed SFCalculator/DISC.doc-faithful Disclosure form.
-- Idempotent: it never archives or reinserts the same reviewed body.

WITH reviewed_body AS (
  SELECT $disclosure$
<div class="sf-disclosure" data-document-footer="none">
  <style>
    @page { size: 8.5in 13in; margin: .38in .42in .15in .42in; }
    .sf-disclosure { box-sizing:border-box; color:#111; font-family:Arial,Helvetica,sans-serif; font-size:9.2pt; line-height:1.18; text-align:left; }
    .sf-disclosure * { box-sizing:border-box; }
    .sf-disclosure .sf-logo { display:block; width:2.05in; height:auto; margin:0 0 -0.01in auto; }
    .sf-disclosure .sf-title { margin:-.03in 0 0; text-align:center; font-size:10.6pt; font-weight:700; line-height:1.15; }
    .sf-disclosure .sf-subtitle { margin:0 0 .16in; text-align:center; font-size:9.1pt; }
    .sf-disclosure .sf-field-row { display:grid; grid-template-columns:1.22in .16in 1fr; min-height:.19in; align-items:end; }
    .sf-disclosure .sf-disclosure-field { border-bottom:.6pt solid #111; min-height:.18in; padding:0 .06in .01in; overflow-wrap:break-word; }
    .sf-disclosure .sf-spacer { height:.13in; }
    .sf-disclosure .sf-row { display:grid; grid-template-columns:.33in 4.55in .6in 1.65in; align-items:end; min-height:.19in; }
    .sf-disclosure .sf-subrow { display:grid; grid-template-columns:.52in .22in 2.53in 1.3in 1.65in; align-items:end; min-height:.19in; }
    .sf-disclosure .sf-no { text-align:left; }
    .sf-disclosure .sf-amount-label { text-align:center; }
    .sf-disclosure .sf-money { border-bottom:.6pt solid #111; min-height:.18in; padding:0 .05in .01in; text-align:right; font-weight:700; }
    .sf-disclosure .sf-money.light { font-weight:400; }
    .sf-disclosure .sf-indent { padding-left:.5in; }
    .sf-disclosure .sf-total { font-weight:700; text-align:center; }
    .sf-disclosure .sf-period { display:grid; grid-template-columns:.55in .65in 4.24in .6in 1.65in; align-items:end; min-height:.22in; }
    .sf-disclosure .sf-inline-line { border-bottom:.6pt solid #111; min-height:.18in; padding:0 .04in .01in; text-align:center; font-weight:700; }
    .sf-disclosure .sf-options { display:grid; grid-template-columns:1.7in 1.25in 1.65in; margin:.05in 0 .02in 1.75in; line-height:1.3; }
    .sf-disclosure .sf-finance-detail { display:grid; grid-template-columns:.52in .22in 2.65in 1.3in 1.65in; align-items:end; min-height:.19in; }
    .sf-disclosure .sf-finance-detail .sf-rule { border-bottom:.6pt solid #111; min-height:.18in; }
    .sf-disclosure .sf-payment-note { display:grid; grid-template-columns:.33in 5.3in 1.62in; align-items:end; min-height:.19in; }
    .sf-disclosure .sf-installment { display:grid; grid-template-columns:.6in 1.7in 1in .58in .8in 1.1in 1.5in; align-items:end; min-height:.2in; }
    .sf-disclosure .sf-charge-head, .sf-disclosure .sf-charge-line { display:grid; grid-template-columns:2.45in 1.2in 1.75in; gap:.45in; margin-left:.35in; }
    .sf-disclosure .sf-charge-head { margin-top:.06in; text-align:center; }
    .sf-disclosure .sf-charge-line > span { border-bottom:.6pt solid #111; min-height:.18in; }
    .sf-disclosure .sf-cert { width:3.1in; margin:.15in .22in .1in auto; text-align:center; }
    .sf-disclosure .sf-cert .sf-cert-line { border-bottom:.6pt solid #111; min-height:.2in; padding:.02in .04in 0; }
    .sf-disclosure .sf-receipt { margin:.18in 0 .18in; text-align:center; font-size:9pt; line-height:1.25; }
    .sf-disclosure .sf-signature { display:grid; grid-template-columns:2.65in 1.5in; column-gap:1.8in; justify-content:center; margin:.12in 0; text-align:center; }
    .sf-disclosure .sf-sign-line { border-bottom:.6pt solid #111; min-height:.2in; padding:.02in .04in 0; }
    .sf-disclosure .sf-notice { margin-top:.08in; text-align:center; }
  </style>
  <img class="doc-logo sf-logo" src="logo.png" alt="Loan Star Lending Group Corp.">
  <div class="sf-title">DISCLOSURE STATEMENT OF LOAN/CREDIT TRANSACTION</div>
  <div class="sf-subtitle">(As required under R.A. 3765, Truth in Lending Act)</div>

  <div class="sf-field-row"><span>Name of Borrower</span><span>:</span><span class="sf-disclosure-field">{{borrowerName}}<span data-if="coBorrowerName"> and {{coBorrowerName}}</span></span></div>
  <div class="sf-field-row"><span>Name of Company</span><span>:</span><span class="sf-disclosure-field">{{businessCompanyName}}</span></div>
  <div class="sf-field-row"><span>Address</span><span>:</span><span class="sf-disclosure-field">{{address}}</span></div>
  <div class="sf-spacer"></div>

  <div class="sf-row"><span class="sf-no">1.</span><span>Amount to be Financed</span><span class="sf-amount-label">PHP</span><span class="sf-money light">{{amountFinanced}}</span></div>
  <div class="sf-row"><span class="sf-no">2.</span><span>Less: Down payment and/or Trade-in Value</span><span></span><span class="sf-money light"></span></div>
  <div class="sf-row"><span class="sf-no">3.</span><span>Unpaid Balance of Cash/Purchase Price or Net Proceeds of loan</span><span></span><span class="sf-money light"></span></div>
  <div class="sf-row"><span class="sf-no">4.</span><span>Non-Finance Charges</span><span></span><span></span></div>
  <div class="sf-subrow"><span></span><span>a.</span><span>Security Fee</span><span></span><span class="sf-money">{{securityFee}}</span></div>
  <div class="sf-subrow"><span></span><span>b.</span><span>Taxes</span><span></span><span class="sf-money"></span></div>
  <div class="sf-subrow"><span></span><span>c.</span><span>Processing Fee</span><span></span><span class="sf-money">{{processingFee}}</span></div>
  <div class="sf-subrow"><span></span><span>d.</span><span>Other Loan</span><span></span><span class="sf-money"></span></div>
  <div class="sf-subrow"><span></span><span>e.</span><span>Notarial Fee</span><span></span><span class="sf-money">{{notaryFee}}</span></div>
  <div class="sf-subrow"><span></span><span>f.</span><span>Payment for Previous Loan</span><span></span><span class="sf-money"></span></div>
  <div class="sf-subrow"><span></span><span>g.</span><span>Advance Payment</span><span></span><span class="sf-money"></span></div>
  <div class="sf-subrow"><span></span><span>h.</span><span>Documentary Stamp</span><span></span><span class="sf-money">{{docStamp}}</span></div>
  <div class="sf-subrow"><span></span><span>i.</span><span>Bank Account Opening</span><span></span><span class="sf-money"></span></div>
  <div class="sf-subrow"><span></span><span>j.</span><span>Admin Cost</span><span></span><span class="sf-money">{{adminCost}}</span></div>
  <div class="sf-row"><span></span><span class="sf-total">Total Non-Finance charges</span><span class="sf-amount-label">Php</span><span class="sf-money">{{nonFinanceCharges}}</span></div>
  <div class="sf-row"><span class="sf-no">5.</span><span>Cash/Purchase Price</span><span class="sf-amount-label">Php</span><span class="sf-money light">{{netLoanAmount}}</span></div>
  <div class="sf-row"><span class="sf-no">6.</span><span>Finance Charges</span><span></span><span></span></div>
  <div class="sf-period"><span></span><span>a.</span><span>Interest: <span class="sf-inline-line">{{interestRate}}</span> p.m. From <span class="sf-inline-line">{{disclosureFromDate}}</span> to <span class="sf-inline-line">{{disclosureToDate}}</span> ({{installmentCount}} months)</span><span class="sf-amount-label">Php</span><span class="sf-money light">{{financeChargeInterest}}</span></div>
  <div class="sf-options"><span>( ) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Simple<br>( ) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Compound</span><span>( )<br>( )<br>( )<br>( )</span><span>6 months+<br>9 months<br>12 months<br>Others _____________</span></div>
  <div class="sf-finance-detail"><span></span><span>b.</span><span>Discounts</span><span class="sf-rule"></span><span></span></div>
  <div class="sf-finance-detail"><span></span><span>c.</span><span>Service/handling charges</span><span class="sf-rule"></span><span></span></div>
  <div class="sf-finance-detail"><span></span><span>d.</span><span>Collection Charges</span><span class="sf-rule"></span><span></span></div>
  <div class="sf-finance-detail"><span></span><span>e.</span><span>Credit Investigation Fees</span><span class="sf-rule"></span><span></span></div>
  <div class="sf-finance-detail"><span></span><span>f.</span><span>Appraisal Fees</span><span class="sf-rule"></span><span></span></div>
  <div class="sf-finance-detail"><span></span><span>g.</span><span>Attorney's/Legal Fees</span><span class="sf-rule"></span><span></span></div>
  <div class="sf-finance-detail"><span></span><span>h.</span><span>Other Charges Incident to the<br>Extension of credit (specify)</span><span class="sf-rule"></span><span></span></div>
  <div class="sf-row"><span></span><span class="sf-total">Total Finance Charge</span><span></span><span class="sf-money"></span></div>
  <div class="sf-row"><span class="sf-no">7.</span><span>Percentage of Finance Charges to Total Amount Financed<br>(Computed in accordance with Sec. 2 (I) of CB Circular 158)</span><span></span><span class="sf-money light">%</span></div>
  <div class="sf-row"><span class="sf-no">8.</span><span>Effective Interest Rate</span><span></span><span class="sf-money light">%</span></div>
  <div class="sf-row"><span class="sf-no">9.</span><span>Payment</span><span></span><span></span></div>
  <div class="sf-payment-note"><span></span><span>a. Single Payment Due ______________________________</span><span></span></div>
  <div class="sf-installment"><span></span><span>b. Total Installment Payments</span><span>(Payable in</span><span class="sf-inline-line">{{installmentCount}}</span><span>months at Php</span><span class="sf-inline-line">{{monthlyAmortization}}</span><span class="sf-money light">{{totalInstallmentPayments}}</span></div>
  <div class="sf-row"><span class="sf-no">10.</span><span>Additional Charges in case certain stipulations in the contract are not met by the debtor</span><span></span><span></span></div>
  <div class="sf-charge-head"><span>Nature</span><span>Rate</span><span>Amount</span></div>
  <div class="sf-charge-line"><span></span><span></span><span></span></div>
  <div class="sf-charge-line"><span></span><span></span><span></span></div>
  <div class="sf-cert"><div>CERTIFIED CORRECT:</div><div class="sf-cert-line">{{lenderRepresentative}}</div><div>Authorized Signatory</div><div class="sf-cert-line">{{lenderRepresentativeTitle}}</div><div>Position</div></div>
  <div class="sf-receipt">I ACKNOWLEDGE RECEIPT OF A COPY OF THIS STATEMENT PRIOR TO THE CONSUMMATION OF THE CREDIT<br>TRANSACTION AND THAT I UNDERSTAND AND FULLY AGREE TO THE TERMS AND CONDITIONS THEREOF:</div>
  <div class="sf-signature"><div><div class="sf-sign-line">{{borrowerName}}</div><div>Borrower Signature Over Printed Name</div></div><div><div class="sf-sign-line">{{todayDate}}</div><div>Date</div></div></div>
  <div class="sf-signature"><div><div class="sf-sign-line">{{coBorrowerName}}</div><div>Co-Borrower Signature Over Printed Name</div></div><div><div class="sf-sign-line">{{todayDate}}</div><div>Date</div></div></div>
  <div class="sf-notice">NOTICE TO BORROWER: YOU ARE ENTITLED TO A COPY OF THIS PAPER WHICH YOU WILL SIGN</div>
</div>$disclosure$::text AS body
)
UPDATE public.document_template_versions v SET status = 'archived'
  FROM public.document_templates t, reviewed_body b
 WHERE v.template_id = t.id
   AND t.slug = 'disclosure_statement'
   AND v.status = 'published'
   AND v.body IS DISTINCT FROM b.body;

WITH reviewed_body AS (
  SELECT $disclosure$
<div class="sf-disclosure" data-document-footer="none">
  <style>
    @page { size: 8.5in 13in; margin: .38in .42in .15in .42in; }
    .sf-disclosure { box-sizing:border-box; color:#111; font-family:Arial,Helvetica,sans-serif; font-size:9.2pt; line-height:1.18; text-align:left; }
    .sf-disclosure * { box-sizing:border-box; }
    .sf-disclosure .sf-logo { display:block; width:2.05in; height:auto; margin:0 0 -0.01in auto; }
    .sf-disclosure .sf-title { margin:-.03in 0 0; text-align:center; font-size:10.6pt; font-weight:700; line-height:1.15; }
    .sf-disclosure .sf-subtitle { margin:0 0 .16in; text-align:center; font-size:9.1pt; }
    .sf-disclosure .sf-field-row { display:grid; grid-template-columns:1.22in .16in 1fr; min-height:.19in; align-items:end; }
    .sf-disclosure .sf-disclosure-field { border-bottom:.6pt solid #111; min-height:.18in; padding:0 .06in .01in; overflow-wrap:break-word; }
    .sf-disclosure .sf-spacer { height:.13in; }
    .sf-disclosure .sf-row { display:grid; grid-template-columns:.33in 4.55in .6in 1.65in; align-items:end; min-height:.19in; }
    .sf-disclosure .sf-subrow { display:grid; grid-template-columns:.52in .22in 2.53in 1.3in 1.65in; align-items:end; min-height:.19in; }
    .sf-disclosure .sf-no { text-align:left; }
    .sf-disclosure .sf-amount-label { text-align:center; }
    .sf-disclosure .sf-money { border-bottom:.6pt solid #111; min-height:.18in; padding:0 .05in .01in; text-align:right; font-weight:700; }
    .sf-disclosure .sf-money.light { font-weight:400; }
    .sf-disclosure .sf-indent { padding-left:.5in; }
    .sf-disclosure .sf-total { font-weight:700; text-align:center; }
    .sf-disclosure .sf-period { display:grid; grid-template-columns:.55in .65in 4.24in .6in 1.65in; align-items:end; min-height:.22in; }
    .sf-disclosure .sf-inline-line { border-bottom:.6pt solid #111; min-height:.18in; padding:0 .04in .01in; text-align:center; font-weight:700; }
    .sf-disclosure .sf-options { display:grid; grid-template-columns:1.7in 1.25in 1.65in; margin:.05in 0 .02in 1.75in; line-height:1.3; }
    .sf-disclosure .sf-finance-detail { display:grid; grid-template-columns:.52in .22in 2.65in 1.3in 1.65in; align-items:end; min-height:.19in; }
    .sf-disclosure .sf-finance-detail .sf-rule { border-bottom:.6pt solid #111; min-height:.18in; }
    .sf-disclosure .sf-payment-note { display:grid; grid-template-columns:.33in 5.3in 1.62in; align-items:end; min-height:.19in; }
    .sf-disclosure .sf-installment { display:grid; grid-template-columns:.6in 1.7in 1in .58in .8in 1.1in 1.5in; align-items:end; min-height:.2in; }
    .sf-disclosure .sf-charge-head, .sf-disclosure .sf-charge-line { display:grid; grid-template-columns:2.45in 1.2in 1.75in; gap:.45in; margin-left:.35in; }
    .sf-disclosure .sf-charge-head { margin-top:.06in; text-align:center; }
    .sf-disclosure .sf-charge-line > span { border-bottom:.6pt solid #111; min-height:.18in; }
    .sf-disclosure .sf-cert { width:3.1in; margin:.15in .22in .1in auto; text-align:center; }
    .sf-disclosure .sf-cert .sf-cert-line { border-bottom:.6pt solid #111; min-height:.2in; padding:.02in .04in 0; }
    .sf-disclosure .sf-receipt { margin:.18in 0 .18in; text-align:center; font-size:9pt; line-height:1.25; }
    .sf-disclosure .sf-signature { display:grid; grid-template-columns:2.65in 1.5in; column-gap:1.8in; justify-content:center; margin:.12in 0; text-align:center; }
    .sf-disclosure .sf-sign-line { border-bottom:.6pt solid #111; min-height:.2in; padding:.02in .04in 0; }
    .sf-disclosure .sf-notice { margin-top:.08in; text-align:center; }
  </style>
  <img class="doc-logo sf-logo" src="logo.png" alt="Loan Star Lending Group Corp.">
  <div class="sf-title">DISCLOSURE STATEMENT OF LOAN/CREDIT TRANSACTION</div>
  <div class="sf-subtitle">(As required under R.A. 3765, Truth in Lending Act)</div>

  <div class="sf-field-row"><span>Name of Borrower</span><span>:</span><span class="sf-disclosure-field">{{borrowerName}}<span data-if="coBorrowerName"> and {{coBorrowerName}}</span></span></div>
  <div class="sf-field-row"><span>Name of Company</span><span>:</span><span class="sf-disclosure-field">{{businessCompanyName}}</span></div>
  <div class="sf-field-row"><span>Address</span><span>:</span><span class="sf-disclosure-field">{{address}}</span></div>
  <div class="sf-spacer"></div>

  <div class="sf-row"><span class="sf-no">1.</span><span>Amount to be Financed</span><span class="sf-amount-label">PHP</span><span class="sf-money light">{{amountFinanced}}</span></div>
  <div class="sf-row"><span class="sf-no">2.</span><span>Less: Down payment and/or Trade-in Value</span><span></span><span class="sf-money light"></span></div>
  <div class="sf-row"><span class="sf-no">3.</span><span>Unpaid Balance of Cash/Purchase Price or Net Proceeds of loan</span><span></span><span class="sf-money light"></span></div>
  <div class="sf-row"><span class="sf-no">4.</span><span>Non-Finance Charges</span><span></span><span></span></div>
  <div class="sf-subrow"><span></span><span>a.</span><span>Security Fee</span><span></span><span class="sf-money">{{securityFee}}</span></div>
  <div class="sf-subrow"><span></span><span>b.</span><span>Taxes</span><span></span><span class="sf-money"></span></div>
  <div class="sf-subrow"><span></span><span>c.</span><span>Processing Fee</span><span></span><span class="sf-money">{{processingFee}}</span></div>
  <div class="sf-subrow"><span></span><span>d.</span><span>Other Loan</span><span></span><span class="sf-money"></span></div>
  <div class="sf-subrow"><span></span><span>e.</span><span>Notarial Fee</span><span></span><span class="sf-money">{{notaryFee}}</span></div>
  <div class="sf-subrow"><span></span><span>f.</span><span>Payment for Previous Loan</span><span></span><span class="sf-money"></span></div>
  <div class="sf-subrow"><span></span><span>g.</span><span>Advance Payment</span><span></span><span class="sf-money"></span></div>
  <div class="sf-subrow"><span></span><span>h.</span><span>Documentary Stamp</span><span></span><span class="sf-money">{{docStamp}}</span></div>
  <div class="sf-subrow"><span></span><span>i.</span><span>Bank Account Opening</span><span></span><span class="sf-money"></span></div>
  <div class="sf-subrow"><span></span><span>j.</span><span>Admin Cost</span><span></span><span class="sf-money">{{adminCost}}</span></div>
  <div class="sf-row"><span></span><span class="sf-total">Total Non-Finance charges</span><span class="sf-amount-label">Php</span><span class="sf-money">{{nonFinanceCharges}}</span></div>
  <div class="sf-row"><span class="sf-no">5.</span><span>Cash/Purchase Price</span><span class="sf-amount-label">Php</span><span class="sf-money light">{{netLoanAmount}}</span></div>
  <div class="sf-row"><span class="sf-no">6.</span><span>Finance Charges</span><span></span><span></span></div>
  <div class="sf-period"><span></span><span>a.</span><span>Interest: <span class="sf-inline-line">{{interestRate}}</span> p.m. From <span class="sf-inline-line">{{disclosureFromDate}}</span> to <span class="sf-inline-line">{{disclosureToDate}}</span> ({{installmentCount}} months)</span><span class="sf-amount-label">Php</span><span class="sf-money light">{{financeChargeInterest}}</span></div>
  <div class="sf-options"><span>( ) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Simple<br>( ) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Compound</span><span>( )<br>( )<br>( )<br>( )</span><span>6 months+<br>9 months<br>12 months<br>Others _____________</span></div>
  <div class="sf-finance-detail"><span></span><span>b.</span><span>Discounts</span><span class="sf-rule"></span><span></span></div>
  <div class="sf-finance-detail"><span></span><span>c.</span><span>Service/handling charges</span><span class="sf-rule"></span><span></span></div>
  <div class="sf-finance-detail"><span></span><span>d.</span><span>Collection Charges</span><span class="sf-rule"></span><span></span></div>
  <div class="sf-finance-detail"><span></span><span>e.</span><span>Credit Investigation Fees</span><span class="sf-rule"></span><span></span></div>
  <div class="sf-finance-detail"><span></span><span>f.</span><span>Appraisal Fees</span><span class="sf-rule"></span><span></span></div>
  <div class="sf-finance-detail"><span></span><span>g.</span><span>Attorney's/Legal Fees</span><span class="sf-rule"></span><span></span></div>
  <div class="sf-finance-detail"><span></span><span>h.</span><span>Other Charges Incident to the<br>Extension of credit (specify)</span><span class="sf-rule"></span><span></span></div>
  <div class="sf-row"><span></span><span class="sf-total">Total Finance Charge</span><span></span><span class="sf-money"></span></div>
  <div class="sf-row"><span class="sf-no">7.</span><span>Percentage of Finance Charges to Total Amount Financed<br>(Computed in accordance with Sec. 2 (I) of CB Circular 158)</span><span></span><span class="sf-money light">%</span></div>
  <div class="sf-row"><span class="sf-no">8.</span><span>Effective Interest Rate</span><span></span><span class="sf-money light">%</span></div>
  <div class="sf-row"><span class="sf-no">9.</span><span>Payment</span><span></span><span></span></div>
  <div class="sf-payment-note"><span></span><span>a. Single Payment Due ______________________________</span><span></span></div>
  <div class="sf-installment"><span></span><span>b. Total Installment Payments</span><span>(Payable in</span><span class="sf-inline-line">{{installmentCount}}</span><span>months at Php</span><span class="sf-inline-line">{{monthlyAmortization}}</span><span class="sf-money light">{{totalInstallmentPayments}}</span></div>
  <div class="sf-row"><span class="sf-no">10.</span><span>Additional Charges in case certain stipulations in the contract are not met by the debtor</span><span></span><span></span></div>
  <div class="sf-charge-head"><span>Nature</span><span>Rate</span><span>Amount</span></div>
  <div class="sf-charge-line"><span></span><span></span><span></span></div>
  <div class="sf-charge-line"><span></span><span></span><span></span></div>
  <div class="sf-cert"><div>CERTIFIED CORRECT:</div><div class="sf-cert-line">{{lenderRepresentative}}</div><div>Authorized Signatory</div><div class="sf-cert-line">{{lenderRepresentativeTitle}}</div><div>Position</div></div>
  <div class="sf-receipt">I ACKNOWLEDGE RECEIPT OF A COPY OF THIS STATEMENT PRIOR TO THE CONSUMMATION OF THE CREDIT<br>TRANSACTION AND THAT I UNDERSTAND AND FULLY AGREE TO THE TERMS AND CONDITIONS THEREOF:</div>
  <div class="sf-signature"><div><div class="sf-sign-line">{{borrowerName}}</div><div>Borrower Signature Over Printed Name</div></div><div><div class="sf-sign-line">{{todayDate}}</div><div>Date</div></div></div>
  <div class="sf-signature"><div><div class="sf-sign-line">{{coBorrowerName}}</div><div>Co-Borrower Signature Over Printed Name</div></div><div><div class="sf-sign-line">{{todayDate}}</div><div>Date</div></div></div>
  <div class="sf-notice">NOTICE TO BORROWER: YOU ARE ENTITLED TO A COPY OF THIS PAPER WHICH YOU WILL SIGN</div>
</div>$disclosure$::text AS body
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
