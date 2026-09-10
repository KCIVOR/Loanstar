-- LSLGC SME document templates — Batch 3: replace the three core release
-- templates with the client's real LSLGC wording (publish v2, archive v1).
--
--   promissory_note        <- PN - MPL.doc
--   disclosure_statement   <- DISCLOSURE.doc
--   loan_agreement         <- LOAN AGREEMENT.doc (standard monthly corporate)
--
-- These slugs are category='release', seafarer_generation='always',
-- sme_generation='always' — used by the LRA release generator for BOTH segments.
-- The current v1 bodies are "[DRAFT — pending Legal review]" placeholders; this
-- migration supersedes them (archive v1, insert v2 as published). Already-signed
-- generated_documents keep their frozen storage PDFs.
--
-- New merge keys (in-words variants, term/PDC counts, notary block, party
-- flags) are supplied by buildReleaseTemplateContext in
-- src/lib/lra/template-context.ts. Uncaptured fields (board resolution no.,
-- corporate secretary, notary jurat) resolve to "" per that file's convention.
--
-- [VERIFY WORDING] markers flag clauses that read as unfinished in the source
-- .doc files. Legal to confirm before these go to real signing.
--
-- Loan Agreement scope note: the 9 source LA variants are consolidated here to
-- the standard MONTHLY corporate/individual form with data-if switches for
-- (a) corporate vs individual party clause and (b) presence of the guaranty
-- check / pre-termination fee. The BI-MONTHLY, PER-DAY-INTEREST and
-- INVOICE-FINANCING variants are materially different contracts and are left as
-- follow-up slugs (isBiMonthly / isPerDayInterest / hasInvoiceAnnex flags and
-- the invoices collection are already wired for when they land).

-- ===========================================================================
-- 1. promissory_note  (PN - MPL)
-- ===========================================================================
UPDATE public.document_template_versions v SET status = 'archived'
  FROM public.document_templates t
 WHERE v.template_id = t.id AND t.slug = 'promissory_note' AND v.status = 'published';

INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT t.id,
       COALESCE((SELECT MAX(version_no) FROM public.document_template_versions WHERE template_id = t.id), 0) + 1,
       $body$
<h2 style="text-align:center">PROMISSORY NOTE</h2>

<p>For value received, I/We, <b>{{borrowerName}}</b>, of legal age and residing at {{address}}, promise to pay <b>{{companyName}}</b> (LSLGC for brevity), or ORDER the sum of {{principalAndCentavosInWords}} (Php {{principal}}), Philippine currency, and I/We have accepted the Terms and Conditions of this Promissory Note (&ldquo;NOTE&rdquo; for brevity) to pay the loan. Furthermore, I/We promise, jointly and severally, to pay this loan in {{termsInWords}} months in the amount of {{monthlyAmortizationAndCentavosInWords}} (Php {{monthlyAmortization}}) per month starting on {{firstPaymentDate}} with a monthly interest of {{interestRateInWords}} and the succeeding monthly installments on the same day of every month thereafter until the obligation is fully paid, without need of any further notice, demand, act or deed on the part of LSLGC.</p>

<p>1. I/We understand that the happening of any of the following events shall be considered as Defaults on the OBLIGATION covered by this Note which shall thereupon become automatically due and demandable, without need of prior notice or demand, to wit; (a) failure to pay on due date any installments and/or penalty; (b) attachment or garnishment of any property, change in ownership or management, death, dissolution, receivership, insolvency, suspension of payments, or of usual business, or any similar proceedings, of me/us or of my/our co-makers, sureties; (c) default in payment by me/us or of my/our co-makers or sureties, of any other present or future loan obligation, whether due to LSLGC or any other third party/ies; (d) any material representation or warranty made by me/us in this Note or any other document relative to this Note shown to be incorrect, misleading, false or fraudulent; (e) any act or event which, in LSLGC's opinion, result in the impairment of my/our financial responsibility/ies; and, (f) failure to comply with the terms and conditions of this Note or any other documents, affidavits or any agreements relative thereto, or with the requirements of applicable laws.</p>

<p>2. In case any installment is not paid when this Note becomes due and demandable or when any of the events enumerated under paragraph 1 of this Note is violated, I/We, without need of demand, shall be liable to pay penalty of five percent (5%) compounded monthly plus twenty-five hundredths percent (0.25%) fraction thereof computed from the unpaid installments or on the whole remaining balance as penalty charge.</p>

<p>3. I/We hereby promise to pay unconditionally to LSLGC the full obligation amount on the ground that I/We will not be able to pay at least two (2) monthly amortizations, at the option of LSLGC. The entire balance of this Note shall become immediately due and demandable.</p>

<p>4. Likewise, I/We hereby understand that the value of this Note and any and all sums payable hereunder consist of the principal and the recomputed interest covering the term of this Note at the rate stated thereof. The interest rate stipulated in this Note shall be considered as a floor rate and may be changed by the parties, from time to time, and at any time prior to the payment of this note. However, it is understood that LSLGC shall send I/We a written notice as to the proposed new interest rate, together with the adjusted rate of the installment payment based on the new interest rate. Thus, from receipt of the said notice I/we shall have thirty (30) days to agree to the new interest rate by giving written notice to LSLGC. Accordingly, I/we hereby agree that my/our failure/s to give the appropriate written notice shall be construed as my/our consent to such new interest rate.</p>
<p>i. However, in the event that I/We agree to the proposed new interest rate, I/We hereby agree to execute and deliver any and all documents, including but not limited to the new promissory note/s as may be deemed necessary by LSLGC. But, should the new interest rate be not acceptable by me/us, then this Note shall be automatically considered as due and demandable at the expiration of the thirty (30)-day period herein mentioned without need of further notice or demand to me/us and I/we hereby agree to pay the entire remaining unpaid balance thereon.</p>

<p>5. In case of pre-payment of this Note, I/We agree to pay penalty equivalent to one month interest or {{interestRateInWords}} of the principal amount to be paid under this Note, except when not allowed under R.A. No. 7394 otherwise known as &ldquo;The Consumer Act of the Philippines&rdquo;.</p>
<p>i. However, the acceptance by LSLGC of any installment payments or any part thereof after due date shall neither be considered as extending the time for the payment of any of the installments aforesaid nor a modification of any conditions thereof. Nor shall the failure of LSLGC to exercise any of its rights under this note constitute or be deemed a waiver of such right.</p>

<p>6. I/We expressly consent to any extension or renewal, or restructuring, in whole or in part, and/or partial payment of this Note, which may be requested by or granted to me/us, and to any change in the interest and other terms and conditions of the OBLIGATION as a result of said extension or renewal, and shall continue to be liable thereon, without the necessity of executing a new Promissory Note provided that I/We must first settle/pay two (2) consecutive monthly payments/installments.</p>
<p>i. Acceptance by LSLGC of payment of any installment or any part thereof after due date shall neither be considered as extending the time for the payment of any of the installments aforesaid nor a modification of any conditions thereof. Nor shall the failure of LSLGC to exercise any of its rights under this note constitute or be deemed a waiver of such right.</p>

<p>7. As a guaranty for any extension or renewal, or restructuring of this Note, I/We agree to issue a signed but undated check with blank amount in favor of LSLGC wherein the latter shall hold the same as guaranty and shall not be deposited while I/We faithfully comply with the provisions contained on this Note and other relative documents. Accordingly, I/We understand that the undated checks are only for the following purposes: (a) payment of penalty; (b) payment of new monthly amortization in any extension or renewal, or restructuring made on the promissory note; and (c) payment in full obligation when the event enumerated under paragraph 3 is violated. Restructuring of loan may either be to shorten or extend the loan term.</p>
<p>i. Thus, in the event that I/We incur any violations as defined in paragraph one (1) of this Note, in paying the monthly installment, I/We hereby authorize LSLGC to fill up the material particulars of the check, which shall be based on the latest Statement of Account.</p>

<p>8. Presentments, demand, notice of dishonor, protest or notice of any kind, are hereby expressly waived by me/us.</p>

<p>9. It is understood that should it become necessary for LSLGC to take any legal action to enforce collection of this Note or institute any legal action and/or exercise/avail of its rights/remedies under this Note or by law or equity, I/We shall pay an additional sum equal to fifteen percent (15%) of the amount due as attorney's fees and/or third-party collection agency fees, in case of default and no legal action is filed. I/We shall pay to LSLGC attorney's fees equivalent to thirty percent (30%) of the total unpaid obligation, in case a legal action is filed in the appropriate court, plus the sum of twenty-five percent (25%) representing liquidated damages, in addition to cost of suit. In case of judicial enforcement, I/We hereby knowingly and voluntarily waive the benefits of Rule 39, Section 12 of the Revised Rules of Court.</p>

<p>10. Any action to enforce payment of the Note or to enforce such other right/remedy, or any action that may be brought by LSLGC or that I/We may file in connection with this note involving LSLGC, I/We voluntarily agree that the said case shall be filed exclusively in the proper Court of Makati City. The foregoing, however, shall not limit the right to commence the proceeding or obtain execution of judgment against the undersigned in any venue or jurisdiction where assets of the undersigned may be found.</p>

<p>11. All notice and/or correspondence relative to this note, including but not limited to demand letters, summons, and subpoenas shall be sent to my/our address stated above or at the address that may hereafter be given in writing by me/us to LSLGC. The mere act of sending any notice or correspondence by mail or by delivery to the aforesaid address shall be valid and effective upon me/us. All notice and/or correspondence relative to this note shall be made by me/us only. Furthermore, all notice and/or correspondence relative to this Note, whether or not I/we am/are abroad or any other place, shall be sent to my/our address/es stated herein, or to a new address within the Philippines, wherein I/We shall notify LSLGC thereof in writing.</p>

<p>12. All taxes, charges and expenses including notarial fees for the execution and registration of this Note, as well as its extension, renewal, amendment, modification or cancellation, including documentary stamp taxes and reasonable out-of-pocket expenses thereto, shall be for my/our account. Such expenses if advanced by LSLGC shall be payable upon demand by LSLGC and such obligation shall likewise be secured by this Note.</p>

<p>13. I/We further manifest that I/We hereby waive all my/our rights, claims and/or causes of action against its Directors, Stockholders, Officers, Staff and Representatives. That I/We agree that I/We are jointly and severally liable to LSLGC in the event of default on any of the obligations of this Note.</p>

<p>14. If any one of the provisions of this Note or any documents executed in connection herewith shall be declared invalid, illegal or unenforceable, the validity, legality and enforceability of the remaining provisions herein shall not in any way be affected or impaired.</p>

<p>15. I/We have read and understood all the terms and conditions set forth herein and in the said Note.</p>

<p>IN WITNESS WHEREOF, the parties hereto have signed this Note at {{executionPlace}} on {{executionDate}}.</p>

<table><tbody><tr>
<td>____________________________<br/><b>{{borrowerName}}</b><br/>Signature Over Borrower's Name<br/>Address: {{address}}<br/>TIN: {{borrowerTin}}</td>
<td>____________________________<br/><b>{{coBorrowerName}}</b><br/>Signature Over Co-Borrower's Name<br/>Address:<br/>TIN:</td>
</tr></tbody></table>

<p>SUBSCRIBED AND SWORN to before me this {{executionDate}}, in {{executionPlace}}; affiant/s exhibiting to me the following:</p>
<table><tbody>
<tr><th>Name</th><th>Identification Card No.</th><th>Validity</th></tr>
<tr><td>{{borrowerName}}</td><td>TIN {{borrowerTin}}</td><td></td></tr>
</tbody></table>
<p>Doc. No. {{notaryDocNo}};<br/>Page No. {{notaryPageNo}};<br/>Book No. {{notaryBookNo}};<br/>Series of {{notarySeries}}.</p>
$body$, 'published', now()
FROM public.document_templates t
WHERE t.slug = 'promissory_note';

-- ===========================================================================
-- 2. disclosure_statement  (DISCLOSURE.doc — RA 3765 Truth-in-Lending form)
-- ===========================================================================
UPDATE public.document_template_versions v SET status = 'archived'
  FROM public.document_templates t
 WHERE v.template_id = t.id AND t.slug = 'disclosure_statement' AND v.status = 'published';

INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT t.id,
       COALESCE((SELECT MAX(version_no) FROM public.document_template_versions WHERE template_id = t.id), 0) + 1,
       $body$
<h2 style="text-align:center">DISCLOSURE STATEMENT OF LOAN/CREDIT TRANSACTION</h2>
<p style="text-align:center">(As required under R.A. 3765, Truth in Lending Act)</p>

<table><tbody>
<tr><td><b>Name of Borrower:</b></td><td>{{borrowerName}}</td></tr>
<tr><td><b>Address:</b></td><td>{{address}}</td></tr>
<tr><td><b>Representative:</b></td><td>{{borrowerRepresentative}}</td></tr>
</tbody></table>

<table><tbody>
<tr><td>1. Amount to be Financed</td><td style="text-align:right">Php {{amountFinanced}}</td></tr>
<tr><td>2. Less: Down payment and/or Trade-in Value</td><td style="text-align:right"></td></tr>
<tr><td>3. Unpaid Balance of Cash/Purchase Price or Net Proceeds of loan</td><td style="text-align:right">Php {{netLoanAmount}}</td></tr>
<tr><td>4. Non-Finance Charges</td><td></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;a. CM Fee</td><td style="text-align:right"></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;b. Taxes</td><td style="text-align:right"></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;c. Processing Fee</td><td style="text-align:right">{{processingFee}}</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;d. Other Loan</td><td style="text-align:right"></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;e. Notarial Fee</td><td style="text-align:right">{{notaryFee}}</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;f. Payment for Previous Loan</td><td style="text-align:right"></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;g. Advance Payment</td><td style="text-align:right"></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;h. Documentary Stamp</td><td style="text-align:right">{{docStamp}}</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;i. Bank Account Opening</td><td style="text-align:right"></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;j. Admin Cost</td><td style="text-align:right">{{adminCost}}</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;Total Non-Finance Charges</td><td style="text-align:right">Php</td></tr>
<tr><td>5. Cash/Purchase Price</td><td style="text-align:right">Php {{amountFinanced}}</td></tr>
<tr><td>6. Finance Charges</td><td></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;a. Interest: {{interestRate}} p.m. from {{disclosureFromDate}} to {{disclosureToDate}} ({{termsInWords}} months)</td><td style="text-align:right">Php {{financeChargeInterest}}</td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;b. Discounts</td><td style="text-align:right"></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;c. Service/handling charges</td><td style="text-align:right"></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;d. Collection Charges</td><td style="text-align:right"></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;e. Credit Investigation Fees</td><td style="text-align:right"></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;f. Appraisal Fees</td><td style="text-align:right"></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;g. Attorney's/Legal Fees</td><td style="text-align:right"></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;h. Other Charges Incident to the Extension of credit</td><td style="text-align:right"></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;Total Finance Charge</td><td style="text-align:right">Php {{financeChargeInterest}}</td></tr>
<tr><td>7. Percentage of Finance Charges to Total Amount Financed (per Sec. 2 (I), CB Circular 158)</td><td style="text-align:right">%</td></tr>
<tr><td>8. Effective Interest Rate</td><td style="text-align:right">%</td></tr>
<tr><td>9. Payment</td><td></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;a. Single Payment Due</td><td style="text-align:right"></td></tr>
<tr><td>&nbsp;&nbsp;&nbsp;b. Total Installment Payments (payable in {{termsInWords}} months)</td><td style="text-align:right">Php {{totalInstallmentPayments}}</td></tr>
<tr><td>10. Additional Charges in case certain stipulations in the contract are not met by the debtor</td><td style="text-align:right"></td></tr>
</tbody></table>

<p style="text-align:right"><b>CERTIFIED CORRECT:</b></p>
<p style="text-align:right">____________________________<br/><b>{{lenderRepresentative}}</b><br/>Authorized Signatory<br/>{{lenderRepresentativeTitle}}</p>

<p>I ACKNOWLEDGE RECEIPT OF A COPY OF THIS STATEMENT PRIOR TO THE CONSUMMATION OF THE CREDIT TRANSACTION AND THAT I UNDERSTAND AND FULLY AGREE TO THE TERMS AND CONDITIONS THEREOF:</p>
<table><tbody><tr>
<td>____________________________<br/><b>{{borrowerName}}</b><br/>Borrower<br/>Date: {{executionDate}}</td>
<td>____________________________<br/><b>{{borrowerRepresentative}}</b><br/>Representative<br/>Date: {{executionDate}}</td>
</tr></tbody></table>

<p><b>NOTICE TO BORROWER: YOU ARE ENTITLED TO A COPY OF THIS PAPER WHICH YOU WILL SIGN.</b></p>
$body$, 'published', now()
FROM public.document_templates t
WHERE t.slug = 'disclosure_statement';

-- ===========================================================================
-- 3. loan_agreement  (LOAN AGREEMENT.doc — standard monthly)
-- ===========================================================================
UPDATE public.document_template_versions v SET status = 'archived'
  FROM public.document_templates t
 WHERE v.template_id = t.id AND t.slug = 'loan_agreement' AND v.status = 'published';

INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT t.id,
       COALESCE((SELECT MAX(version_no) FROM public.document_template_versions WHERE template_id = t.id), 0) + 1,
       $body$
<p><b>LOAN NO.:</b> {{loanAccountNo}}</p>
<h2 style="text-align:center">LOAN AGREEMENT</h2>
<h3 style="text-align:center">ACKNOWLEDGEMENT OF DEBT</h3>

<p>entered into between:</p>
<p><b>{{companyName}}</b>, a corporation duly organized by Philippine law, with office address at {{lenderAddress}}, represented by {{lenderRepresentative}}, known as the &ldquo;LENDER&rdquo;</p>
<p>and</p>
<p data-if="isCorporateBorrower"><b>{{borrowerName}}</b>, a corporation duly incorporated under the laws of the Philippines, with primary office address at {{address}}, herein represented by {{borrowerRepresentative}}, known as its &ldquo;{{borrowerRepresentativeTitle}}&rdquo;, hereby authorized to transact, and execute and sign all documents in behalf of the Corporation by virtue of Board Resolution No. {{boardResolutionNo}} executed by Corporate Secretary, {{corporateSecretary}}, hereinafter referred to as the &ldquo;BORROWER&rdquo;.</p>
<p data-unless="isCorporateBorrower"><b>{{borrowerName}}</b>, of legal age and residing at {{address}}, hereinafter referred to as the &ldquo;BORROWER&rdquo;.</p>

<p><b>1. Amount of Loan</b><br/>
The Lender hereby agrees to lend the sum of {{principalAndCentavosInWords}} (Php {{principal}}) on {{executionDate}} to the Borrower on the terms set out hereunder.</p>

<p><b>2. Period of Loan and Schedule of Payments</b><br/>
This loan shall be payable for a period of {{termsInWords}} months including the interest upon release of the loan from {{loanStartDate}} until {{loanMaturityDate}} (Schedule of Payments in Annex &ldquo;A&rdquo; Borrower's Loan Released Information and Annex &ldquo;B&rdquo; Disclosure Statement).</p>

<p><b>3. Interest and Monthly Amortization</b><br/>
The Borrower shall be obliged to pay this loan in {{termsInWords}} months term with a monthly interest of {{interestRateInWords}}, hence, the principal and interest thereto will have a Total Loan Amount of {{totalLoanAndCentavosInWords}} (Php {{totalLoan}}) starting {{loanStartDate}} and the succeeding monthly installments on the same day of every month thereafter until the obligation is fully paid, without need of any further notice, demand, act or deed on the part of the Lender.</p>
<p>Upon execution of this agreement, the Borrower shall issue to the Lender {{numberOfPdcsInWords}} Post-Dated Checks with each check amounting to {{perCheckAmountInWords}} (Php {{perCheckAmount}}) from {{loanStartDate}} until {{loanMaturityDate}}. The Post-Dated Checks will be deposited as dated for payment towards the amortization of the loan.</p>

<div data-if="hasInvoiceAnnex">
<p><b>Financed invoice/s:</b></p>
<table><tbody>
<tr><th>Invoice No.</th><th>Invoice Date</th><th>Amount</th><th>Payor</th></tr>
<tr data-repeat="invoices"><td>{{invoiceNo}}</td><td>{{invoiceDate}}</td><td>{{invoiceAmount}}</td><td>{{payor}}</td></tr>
</tbody></table>
</div>

<p><b>4. Security</b><br/>This agreement is subject to the Terms and Conditions:</p>
<p data-if="hasSecurityCheck">4.1. The Borrower shall issue {{numberOfPdcsInWords}} postdated checks plus One (1) personal check of the company President/Treasurer, signed but undated and with blank amount in favor of the Lender, wherein the latter shall hold the same as guaranty and shall not be deposited while the Borrower faithfully complies with the provisions contained in this loan agreement and other relative documents. Accordingly, the Borrower understands that the undated blank-amount check is only for the following purposes: (a) payment of penalty; (b) payment of monthly amortization with penalty; and (c) payment in full obligation in the event that the Borrower will not be able to pay at least two (2) monthly amortizations;</p>
<p data-unless="hasSecurityCheck">4.1. The Borrower shall issue {{numberOfPdcsInWords}} postdated checks. The postdated checks will be deposited as dated for payment towards the amortization of the loan;</p>
<p>4.2. In the event that the Borrower's checks shall be returned/defaulted for any reasons stated by the depository banks, the Lender will call the Borrower's attention and deposit the checks within 5 days or based on the approved deposit date of the borrower;</p>
<p>4.3. The Lender shall be entitled to collect a late payment penalty of five percent (5%) compounded monthly to be deposited in cash under the account of the Lender without need of demand;</p>
<p>4.4. In the event that the account will be endorsed to a third-party collection entity, the Borrower shall be responsible and liable for all charges of the third-party collection entity. This will be added to the statement of obligation of the Borrower;</p>
<p>4.5. The entire balance of this loan agreement shall become immediately due and demandable upon non-payment of at least two (2) monthly amortizations, at the option of the Lender.<span data-if="hasSecurityCheck"> The Lender will deposit the guaranty checks issued by the Borrower for payment of full obligation;</span></p>
<p>4.6. If the Borrower will seek an order of relief for all his obligations using Republic Act No. 10142, otherwise known as the Financial Rehabilitation and Insolvency Act (FRIA) of 2010, this loan agreement should be included and all Collateral should not be included in the Borrower's Petition;</p>

<p><b>5. Loan Pre-Termination</b><br/>
<span data-if="hasSecurityCheck">Pre-termination fee will be imposed if the borrower will shorten the contract of this Loan Agreement by paying out the balance before maturity of the loan. Pre-termination fee is {{preTerminationRateInWords}} of the principal loan amount;</span><span data-unless="hasSecurityCheck">There shall be no pre-termination fee imposed if the borrower will shorten the contract of this Loan Agreement by paying out the balance before maturity of the loan.</span></p>

<p><b>6. The whole contract</b><br/>
The parties confirm that this contract contains the full terms of their agreement and that no addition to or variation of the contract shall be of any force and effect unless done in writing and signed by both parties. Should it become necessary for the Lender to take any legal action to enforce collection of this loan agreement or institute any legal action and/or exercise/avail of its rights/remedies under this loan agreement or by law or equity, the Lender may exercise all its rights to collect penalty including filing of a case in the court chosen by the Lender. All legal suit including Attorney's fees will be charged to the Borrower. In case of judicial enforcement, the Borrower knowingly and voluntarily waives the benefits of Rule 39, Section 12 of the Revised Rules of Court;</p>
<p>6.1 In case of default and legal action is required, the Borrower shall be responsible and liable for all lawsuit-related charges including Attorneys' Fees which will be included in the statement of obligation of the Borrower as stated in 4.4 of this Agreement;</p>
<p>6.2 All notice and/or correspondence relative to this loan agreement, including but not limited to demand letters, summons, and subpoenas shall be sent to the Borrower's address stated above or at the address that may hereafter be given in writing by the Borrower to the Lender. The mere act of sending any notice or correspondence by mail or by delivery to the aforesaid address shall be valid and effective upon the Borrower only. All notice and/or correspondence relative to this loan agreement shall be made by the Borrower only. Furthermore, all notice and/or correspondence relative to this loan agreement, whether or not the Borrower is abroad or any other place, shall be sent to the Borrower's address/es stated herein, or to a new address within the Philippines, wherein the Borrower shall notify the Lender thereof in writing;</p>
<p>6.3 Further, the Borrower hereby waives all rights, claims and/or causes of action against the Lender's Directors, Stockholders, Officers, Staff and Representatives. The Borrowers are jointly and severally liable to the Lender in the event of default on any of the obligations of this loan agreement;</p>
<p>6.4 If any one of the provisions of this loan agreement or any documents executed in connection herewith shall be declared invalid, illegal or unenforceable, the validity, legality and enforceability of the remaining provisions herein shall not in any way be affected or impaired;</p>
<p>6.5 The Borrower has read and understood all the terms and conditions set forth herein and in the said loan agreement.</p>

<p><b>7. Loan with Mortgage</b><br/>
If any, the Lender accepts the mortgage provided by the Borrower at the given value at the time the loan agreement is executed. This mortgage has counterpart documents such as Voluntary Surrender with terms of execution, including the Deed of Sale as Annexes and details of the mortgage items.</p>

<p>IN WITNESS WHEREOF, the parties hereto have signed this instrument at {{executionPlace}} on {{executionDate}}.</p>

<table><tbody><tr>
<td><b>{{companyName}}</b><br/>Represented by:<br/>____________________________<br/>{{lenderRepresentative}}<br/>Date: {{executionDate}}</td>
<td><b>{{borrowerName}}</b><br/>Represented by:<br/>____________________________<br/>{{borrowerRepresentative}}<br/>Date: {{executionDate}}</td>
</tr></tbody></table>

<p><b>Witnesses:</b></p>
<table><tbody><tr>
<td>____________________________</td>
<td>____________________________</td>
</tr></tbody></table>

<p><b>ACKNOWLEDGEMENT</b></p>
<p>REPUBLIC OF THE PHILIPPINES&nbsp;)<br/>_____________________________&nbsp;) S.S.</p>
<p>BEFORE ME, a Notary Public for and in the City of {{executionPlace}} on {{executionDate}}, personally appeared:</p>
<table><tbody>
<tr><th>Name</th><th>ID / Card Number</th><th>Validity</th></tr>
<tr><td>{{companyName}}</td><td>TIN {{lenderTin}}</td><td></td></tr>
<tr><td>{{lenderRepresentative}}</td><td>TIN {{lenderRepresentativeTin}}</td><td></td></tr>
<tr><td>{{borrowerName}}</td><td>TIN {{borrowerTin}}</td><td></td></tr>
<tr><td>{{borrowerRepresentative}}</td><td></td><td></td></tr>
</tbody></table>
<p>Known to me and to me known to be the same persons who executed the Loan Agreement, consisting of pages including this page whereon this acknowledgement is written and signed by the parties on each page of this instrument.</p>
<p>WITNESS MY HAND AND SEAL on the date and place first above written.</p>
<p>Doc. No. {{notaryDocNo}};<br/>Page No. {{notaryPageNo}};<br/>Book No. {{notaryBookNo}};<br/>Series of {{notarySeries}}.</p>
$body$, 'published', now()
FROM public.document_templates t
WHERE t.slug = 'loan_agreement';
