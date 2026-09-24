/**
 * SFCalculator/DISC.doc, transcribed into the schema-safe HTML the Admin
 * template editor actually supports: `<table data-plain>` rows with
 * `data-underline` value cells (not a per-template `<style>` block or CSS
 * Grid, neither of which survives the TipTap round-trip — see
 * src/components/admin/template-editor/extensions.ts). Everything here is
 * built only from primitives that extension already declares: `data-accurate`
 * (compact source-measured typography), `data-plain` (borderless layout
 * table), `data-underline` (single bottom rule per cell), `data-align`,
 * native `<u>`, and `data-if` — so loading this into the Visual editor and
 * saving it back produces the same document, not a flattened one.
 */
export const SOURCE_FAITHFUL_DISCLOSURE_PREVIEW = String.raw`
<div data-accurate data-document-footer="none">
<div data-align="right"><img class="doc-logo" src="logo.png" alt="Loan Star Lending Group Corp." width="160"></div>
<h2 data-align="center">DISCLOSURE STATEMENT OF LOAN/CREDIT TRANSACTION</h2>
<p data-align="center">(As required under R.A. 3765, Truth in Lending Act)</p>

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
<tr><td>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;( ) Compound &nbsp;&nbsp;&nbsp;( ) 9 months &nbsp;&nbsp;&nbsp;( ) 12 months &nbsp;&nbsp;&nbsp;( ) Others ____________</td><td></td><td></td></tr>
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

<p data-align="center">NOTICE TO BORROWER: YOU ARE ENTITLED TO A COPY OF THIS PAPER WHICH YOU WILL SIGN</p>
</div>`;
