-- Fix loan_agreement_vienovo's Clause 3 PDC paragraph, checked against the
-- most recently-dated Vienovo source,
-- `Vienovo Loan Agreement - quarter2months 02.20.26.doc` (cross-checked
-- against the earlier `... 02.05.26.doc` and the undated blank
-- `... quarter2months.doc` template — all 3 agree on wording, differing
-- only in the filled-in loan figures/dates, so there is nothing to
-- reconcile between them).
--
-- All 3 sources' Clause 3 has a second paragraph spelling out the per-check
-- PDC amount and date range — e.g. "...the Borrower shall issue to the
-- Lender Four (4) Post-Dated Checks with each check[s] is amounting to ONE
-- HUNDRED FIFTY THOUSAND PESOS (Php 150,000.00) from April 28, 2026 until
-- August 28, 2026, and FIVE MILLION PESOS (Php 5,000,000.00) on August 28,
-- 2026." The published body's equivalent paragraph had dropped this detail
-- entirely ("...Post-Dated Checks in favor of the Lender, to be deposited
-- as dated..."). The sibling `loan_agreement` slug's own Clause 3 already
-- carries the equivalent sentence using merge keys that already exist in
-- template-context.ts (`perCheckAmountInWords` / `perCheckAmount` /
-- `loanStartDate` / `loanMaturityDate`) — this migration reuses that exact,
-- already-reviewed pattern. It does not reproduce the source's own final
-- balloon-check clause (a distinct, larger final PDC equal to the full
-- principal) — the current PDC data model has no single clean merge key
-- for that yet; see loan-agreement-vienovo-preview.ts's header comment.
--
-- Nothing else in the published body changed: rendered through the real
-- Gotenberg pipeline and compared against the source's page geometry, the
-- rest of the document (recipient block, isCorporateBorrower conditional,
-- isQuarterly/isEvery2Months conditional, boilerplate clauses 4-7,
-- signature/acknowledgement blocks) already matched.
--
-- See tiptap-roundtrip.test.mts: loan_agreement_vienovo_source_faithful.
-- Idempotent: archives the current published body only if different, then
-- inserts the reviewed body as a new published version only if not already
-- present verbatim. Never applied automatically — see AGENTS.md
-- instructions for this document-fidelity phase.

WITH reviewed_body AS (
  SELECT $lav$
<p><b>LOAN NO.:</b> {{loanAccountNo}}</p>
<h2 style="text-align:center">LOAN AGREEMENT</h2>
<h3 style="text-align:center">ACKNOWLEDGEMENT OF DEBT</h3>

<p>entered into between:</p>
<p><b>{{companyName}}</b>, a corporation duly organized by Philippine law, with office address at {{lenderAddress}}, represented by {{lenderRepresentative}}, known as the &ldquo;LENDER&rdquo;</p>
<p>and</p>
<p data-if="isCorporateBorrower"><b>{{borrowerName}}</b>, a corporation duly incorporated under the laws of the Philippines, with primary office address at {{address}}, herein represented by {{borrowerRepresentative}}, known as its &ldquo;{{borrowerRepresentativeTitle}}&rdquo;, hereinafter referred to as the &ldquo;BORROWER&rdquo;.</p>
<p data-unless="isCorporateBorrower"><b>{{borrowerName}}</b>, of legal age and residing at {{address}}, hereinafter referred to as the &ldquo;BORROWER&rdquo;.</p>

<p><b>1. Amount of Loan</b><br/>
The Lender hereby agrees to lend the sum of {{principalAndCentavosInWords}} (Php {{principal}}) on {{executionDate}} to the Borrower on the terms set out hereunder.</p>

<p><b>2. Period of Loan and Schedule of Payments</b><br/>
This loan shall be payable for a period of {{termsInWords}} months including the interest upon release of the loan from {{loanStartDate}} until {{loanMaturityDate}} (Schedule of Payments in Annex &ldquo;A&rdquo; Borrower's Loan Released Information and Annex &ldquo;B&rdquo; Disclosure Statement).</p>

<p><b>3. Interest and Amortization</b><br/>
The Borrower shall be obliged to pay this loan in {{termsInWords}} months term with a monthly interest of {{interestRateInWords}}, hence, the principal and interest thereto will have a Total Loan Amount of {{totalLoanAndCentavosInWords}} (Php {{totalLoan}}) starting {{loanStartDate}} until {{loanMaturityDate}} and is payable on a<span data-unless="isEvery2Months"> quarterly</span><span data-if="isEvery2Months">n every-two-months</span> basis thereafter until the obligation is fully paid, without the need of any further notice, demand, act, or deed on the part of the Lender.</p>
<p>Upon execution of this agreement, the Borrower shall issue to the Lender {{numberOfPdcsInWords}} Post-Dated Checks with each check amounting to {{perCheckAmountInWords}} (Php {{perCheckAmount}}) from {{loanStartDate}} until {{loanMaturityDate}}. The Post-Dated Checks will be deposited as dated for payment towards the amortization of the loan.</p>

<p><b>4. Security</b><br/>This agreement is subject to the following terms and conditions:</p>
<p>4.1. The Borrower shall issue {{numberOfPdcsInWords}} postdated checks in favor of the Lender;</p>
<p>4.2. In the event that the Borrower's checks shall be returned/defaulted for any reasons stated by the depository banks, the Lender will call the Borrower's attention and deposit the checks within 5 days or based on the approved deposit date of the borrower;</p>
<p>4.3. The Lender shall be entitled to collect a late payment penalty of five percent (5%) compounded monthly to be deposited in cash under the account of the Lender without need of demand;</p>
<p>4.4. In the event that the account will be endorsed to a third-party collection entity, the Borrower shall be responsible and liable for all charges of the third-party collection entity. This will be added to the statement of obligation of the Borrower;</p>
<p>4.5. The entire balance of this loan agreement shall become immediately due and demandable upon non-payment of at least two (2) monthly amortizations, at the option of the Lender. The Lender will deposit the guaranty checks issued by the Borrower and/or the Representative for payment of full obligation;</p>
<p>4.6. If the Borrower will seek an order of relief for all his obligations using Republic Act No. 10142, otherwise known as the Financial Rehabilitation and Insolvency Act (FRIA) of 2010, this loan agreement should be included and all Collateral should not be included in the Borrower's Petition;</p>

<p><b>5. Loan Pre-Termination</b><br/>
The Borrower may terminate this Loan Agreement, including any scheduled payments, for any reason by providing sixty (60) calendar days' termination notice. A pre-termination fee will not be imposed if the borrower will shorten the contract of this Loan Agreement by paying out the balance before maturity of the loan.</p>

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
<table><tbody><tr><td>____________________________</td><td>____________________________</td></tr></tbody></table>

<p><b>ACKNOWLEDGEMENT</b></p>
<p>REPUBLIC OF THE PHILIPPINES&nbsp;)<br/>_____________________________&nbsp;) S.S.</p>
<p>BEFORE ME, a Notary Public for and in the City of {{executionPlace}} on {{executionDate}}, personally appeared:</p>
<table><tbody>
<tr><th>Name</th><th>ID / Card Number</th><th>Validity</th></tr>
<tr><td>{{companyName}}</td><td>TIN {{lenderTin}}</td><td></td></tr>
<tr><td>{{lenderRepresentative}}</td><td>TIN {{lenderRepresentativeTin}}</td><td></td></tr>
<tr><td>{{borrowerName}}</td><td>TIN {{borrowerTin}}</td><td></td></tr>
</tbody></table>
<p>Known to me and to me known to be the same persons who executed the Loan Agreement, consisting of three (3) pages including this page whereon this acknowledgement is written and signed by the parties on each page of this instrument.</p>
<p>WITNESS MY HAND AND SEAL on the date and place first above written.</p>
<p>Doc. No. {{notaryDocNo}};<br/>Page No. {{notaryPageNo}};<br/>Book No. {{notaryBookNo}};<br/>Series of {{notarySeries}}.</p>
$lav$::text AS body
)
UPDATE public.document_template_versions v SET status = 'archived'
  FROM public.document_templates t, reviewed_body b
 WHERE v.template_id = t.id
   AND t.slug = 'loan_agreement_vienovo'
   AND v.status = 'published'
   AND v.body IS DISTINCT FROM b.body;

WITH reviewed_body AS (
  SELECT $lav$
<p><b>LOAN NO.:</b> {{loanAccountNo}}</p>
<h2 style="text-align:center">LOAN AGREEMENT</h2>
<h3 style="text-align:center">ACKNOWLEDGEMENT OF DEBT</h3>

<p>entered into between:</p>
<p><b>{{companyName}}</b>, a corporation duly organized by Philippine law, with office address at {{lenderAddress}}, represented by {{lenderRepresentative}}, known as the &ldquo;LENDER&rdquo;</p>
<p>and</p>
<p data-if="isCorporateBorrower"><b>{{borrowerName}}</b>, a corporation duly incorporated under the laws of the Philippines, with primary office address at {{address}}, herein represented by {{borrowerRepresentative}}, known as its &ldquo;{{borrowerRepresentativeTitle}}&rdquo;, hereinafter referred to as the &ldquo;BORROWER&rdquo;.</p>
<p data-unless="isCorporateBorrower"><b>{{borrowerName}}</b>, of legal age and residing at {{address}}, hereinafter referred to as the &ldquo;BORROWER&rdquo;.</p>

<p><b>1. Amount of Loan</b><br/>
The Lender hereby agrees to lend the sum of {{principalAndCentavosInWords}} (Php {{principal}}) on {{executionDate}} to the Borrower on the terms set out hereunder.</p>

<p><b>2. Period of Loan and Schedule of Payments</b><br/>
This loan shall be payable for a period of {{termsInWords}} months including the interest upon release of the loan from {{loanStartDate}} until {{loanMaturityDate}} (Schedule of Payments in Annex &ldquo;A&rdquo; Borrower's Loan Released Information and Annex &ldquo;B&rdquo; Disclosure Statement).</p>

<p><b>3. Interest and Amortization</b><br/>
The Borrower shall be obliged to pay this loan in {{termsInWords}} months term with a monthly interest of {{interestRateInWords}}, hence, the principal and interest thereto will have a Total Loan Amount of {{totalLoanAndCentavosInWords}} (Php {{totalLoan}}) starting {{loanStartDate}} until {{loanMaturityDate}} and is payable on a<span data-unless="isEvery2Months"> quarterly</span><span data-if="isEvery2Months">n every-two-months</span> basis thereafter until the obligation is fully paid, without the need of any further notice, demand, act, or deed on the part of the Lender.</p>
<p>Upon execution of this agreement, the Borrower shall issue to the Lender {{numberOfPdcsInWords}} Post-Dated Checks with each check amounting to {{perCheckAmountInWords}} (Php {{perCheckAmount}}) from {{loanStartDate}} until {{loanMaturityDate}}. The Post-Dated Checks will be deposited as dated for payment towards the amortization of the loan.</p>

<p><b>4. Security</b><br/>This agreement is subject to the following terms and conditions:</p>
<p>4.1. The Borrower shall issue {{numberOfPdcsInWords}} postdated checks in favor of the Lender;</p>
<p>4.2. In the event that the Borrower's checks shall be returned/defaulted for any reasons stated by the depository banks, the Lender will call the Borrower's attention and deposit the checks within 5 days or based on the approved deposit date of the borrower;</p>
<p>4.3. The Lender shall be entitled to collect a late payment penalty of five percent (5%) compounded monthly to be deposited in cash under the account of the Lender without need of demand;</p>
<p>4.4. In the event that the account will be endorsed to a third-party collection entity, the Borrower shall be responsible and liable for all charges of the third-party collection entity. This will be added to the statement of obligation of the Borrower;</p>
<p>4.5. The entire balance of this loan agreement shall become immediately due and demandable upon non-payment of at least two (2) monthly amortizations, at the option of the Lender. The Lender will deposit the guaranty checks issued by the Borrower and/or the Representative for payment of full obligation;</p>
<p>4.6. If the Borrower will seek an order of relief for all his obligations using Republic Act No. 10142, otherwise known as the Financial Rehabilitation and Insolvency Act (FRIA) of 2010, this loan agreement should be included and all Collateral should not be included in the Borrower's Petition;</p>

<p><b>5. Loan Pre-Termination</b><br/>
The Borrower may terminate this Loan Agreement, including any scheduled payments, for any reason by providing sixty (60) calendar days' termination notice. A pre-termination fee will not be imposed if the borrower will shorten the contract of this Loan Agreement by paying out the balance before maturity of the loan.</p>

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
<table><tbody><tr><td>____________________________</td><td>____________________________</td></tr></tbody></table>

<p><b>ACKNOWLEDGEMENT</b></p>
<p>REPUBLIC OF THE PHILIPPINES&nbsp;)<br/>_____________________________&nbsp;) S.S.</p>
<p>BEFORE ME, a Notary Public for and in the City of {{executionPlace}} on {{executionDate}}, personally appeared:</p>
<table><tbody>
<tr><th>Name</th><th>ID / Card Number</th><th>Validity</th></tr>
<tr><td>{{companyName}}</td><td>TIN {{lenderTin}}</td><td></td></tr>
<tr><td>{{lenderRepresentative}}</td><td>TIN {{lenderRepresentativeTin}}</td><td></td></tr>
<tr><td>{{borrowerName}}</td><td>TIN {{borrowerTin}}</td><td></td></tr>
</tbody></table>
<p>Known to me and to me known to be the same persons who executed the Loan Agreement, consisting of three (3) pages including this page whereon this acknowledgement is written and signed by the parties on each page of this instrument.</p>
<p>WITNESS MY HAND AND SEAL on the date and place first above written.</p>
<p>Doc. No. {{notaryDocNo}};<br/>Page No. {{notaryPageNo}};<br/>Book No. {{notaryBookNo}};<br/>Series of {{notarySeries}}.</p>
$lav$::text AS body
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT t.id,
       COALESCE((SELECT MAX(version_no) FROM public.document_template_versions WHERE template_id = t.id), 0) + 1,
       b.body,
       'published',
       now()
  FROM public.document_templates t
 CROSS JOIN reviewed_body b
 WHERE t.slug = 'loan_agreement_vienovo'
   AND NOT EXISTS (
     SELECT 1 FROM public.document_template_versions v
      WHERE v.template_id = t.id AND v.body = b.body
   );
