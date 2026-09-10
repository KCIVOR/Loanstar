-- LSLGC SME document templates — Batch 4.
--
-- Replace (archive v1, publish next version):
--   deed_of_chattel_mortgage   <- CHATTEL MORTGAGE - N units.doc
--   real_estate_mortgage       <- REAL ESTATE MORTGAGE - N Properties.doc
--   demand_letter              <- Demand Letter - without PDC 2024.doc (Notice to Pay)
--
-- New:
--   demand_letter_dishonored_check  <- Demand Letter - {SME,Co-borrower,Individual}.doc
--   loan_agreement_vienovo          <- Vienovo Loan Agreement - quarter2months.doc
--
-- Merge keys come from buildReleaseTemplateContext (mortgages, vienovo LA) and
-- buildDemandLetterContext (demand_letter). demand_letter_dishonored_check is
-- admin-editable only — it renders against buildSampleContext() for preview and
-- needs check details the collector flow does not capture today.
--
-- Separate UPDATE + INSERT per slug (data-modifying CTEs conflict with the
-- idx_document_template_versions_one_published partial unique index).
-- [VERIFY WORDING] on the "chattel mortgage shall at once become null and void"
-- line inside the REAL ESTATE MORTGAGE source (says "chattel" — kept verbatim).

-- ===========================================================================
-- 1. deed_of_chattel_mortgage  (replace)
-- ===========================================================================
UPDATE public.document_template_versions v SET status = 'archived'
  FROM public.document_templates t
 WHERE v.template_id = t.id AND t.slug = 'deed_of_chattel_mortgage' AND v.status = 'published';

INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT t.id,
       COALESCE((SELECT MAX(version_no) FROM public.document_template_versions WHERE template_id = t.id), 0) + 1,
       $body$
<h2 style="text-align:center">CHATTEL MORTGAGE</h2>

<p>This CHATTEL MORTGAGE made and executed by:</p>

<p><b>{{borrowerName}}</b>, of legal age, with postal address at {{address}}, hereinafter known as the &ldquo;MORTGAGOR&rdquo;;</p>
<p>-and-</p>
<p><b>{{companyName}}</b>, a corporation established under Philippine law represented by its president, {{lenderRepresentative}}, with postal address at {{lenderAddress}}, hereinafter known as the &ldquo;MORTGAGEE&rdquo;,</p>

<p>witnesseth:</p>

<p>That the MORTGAGOR is indebted unto the MORTGAGEE in the sum of {{principalAndCentavosInWords}} (Php {{principal}}), Philippine Currency, receipt of which is acknowledged by the MORTGAGOR upon the signing of this instrument, payable within a period of {{termsInWords}} months, with interest thereon at the rate of {{interestRateInWords}} per month; below are the details of the vehicle/s:</p>

<table><tbody>
<tr><th>Make / Year Model</th><th>Engine No.</th><th>Chassis No.</th><th>Plate No.</th><th>CR No.</th><th>MV File No.</th><th>Registered Owner</th></tr>
<tr data-repeat="vehicles"><td>{{makeYearModel}}</td><td>{{engineNo}}</td><td>{{chassisNo}}</td><td>{{plateNo}}</td><td>{{crNo}}</td><td>{{mvFileNo}}</td><td>{{registeredOwner}}</td></tr>
</tbody></table>

<p>That for, and in consideration of, this indebtedness, and to assure the performance of said obligation to pay, the MORTGAGOR hereby conveys by way of CHATTEL MORTGAGE unto the MORTGAGEE, his heirs and assigns, the personal property described above, now in the possession of said MORTGAGOR.</p>

<p>That the condition of this obligation is that should the MORTGAGOR perform the obligation to pay the hereinabove-cited indebtedness of {{totalLoanAndCentavosInWords}} (Php {{totalLoan}}) together with accrued interest thereon, this chattel mortgage shall at once become null and void and of no effect whatsoever; otherwise, it shall remain in full force and effect.</p>

<p>IN WITNESS WHEREOF, the parties have hereunto set their hands this {{executionDate}} at {{executionPlace}}, Philippines.</p>

<table><tbody><tr>
<td><b>{{companyName}}</b><br/>Represented by:<br/>____________________________<br/>{{lenderRepresentative}}<br/>Mortgagee</td>
<td>____________________________<br/><b>{{borrowerName}}</b><br/>Mortgagor</td>
</tr></tbody></table>

<p>IN THE PRESENCE OF:</p>
<table><tbody><tr><td>____________________________</td><td>____________________________</td></tr></tbody></table>

<p><b>AFFIDAVIT OF GOOD FAITH</b></p>
<p>We severally swear that the foregoing mortgage is made for the purpose of securing the obligation specified in the conditions thereof, and for no other purpose, and that the same is a just and valid obligation and one not entered into for the purpose of fraud.</p>
<table><tbody><tr>
<td><b>{{companyName}}</b><br/>Represented by:<br/>____________________________<br/>{{lenderRepresentative}}<br/>Mortgagee</td>
<td>____________________________<br/><b>{{borrowerName}}</b><br/>Mortgagor</td>
</tr></tbody></table>
<p>IN THE PRESENCE OF:</p>
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
<p>Known to me and to me known to be the same persons who executed the Chattel Mortgage, consisting of two (2) pages including this page whereon this acknowledgement is written and signed by the parties on each page of this instrument.</p>
<p>WITNESS MY HAND AND SEAL on the date and place first above written.</p>
<p>Doc. No. {{notaryDocNo}};<br/>Page No. {{notaryPageNo}};<br/>Book No. {{notaryBookNo}};<br/>Series of {{notarySeries}}.</p>
$body$, 'published', now()
FROM public.document_templates t
WHERE t.slug = 'deed_of_chattel_mortgage';

-- ===========================================================================
-- 2. real_estate_mortgage  (replace)
-- ===========================================================================
UPDATE public.document_template_versions v SET status = 'archived'
  FROM public.document_templates t
 WHERE v.template_id = t.id AND t.slug = 'real_estate_mortgage' AND v.status = 'published';

INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT t.id,
       COALESCE((SELECT MAX(version_no) FROM public.document_template_versions WHERE template_id = t.id), 0) + 1,
       $body$
<h2 style="text-align:center">REAL ESTATE MORTGAGE</h2>

<p>This REAL ESTATE MORTGAGE made and executed by:</p>

<p><b>{{borrowerName}}</b>, of legal age, with postal address at {{address}}, hereinafter known as the &ldquo;MORTGAGOR&rdquo;;</p>
<p>-and-</p>
<p><b>{{companyName}}</b>, a corporation established under Philippine law represented by its president, {{lenderRepresentative}}, with postal address at {{lenderAddress}}, hereinafter known as the &ldquo;MORTGAGEE&rdquo;,</p>

<p>witnesseth:</p>

<p>That the MORTGAGOR is indebted unto the MORTGAGEE in the sum of {{principalAndCentavosInWords}} (Php {{principal}}), Philippine Currency, receipt of which is acknowledged by the MORTGAGOR upon the signing of this instrument, payable within a period of {{termsInWords}} months, with interest thereon at the rate of {{interestRateInWords}} per month; below are the details of the property/ies:</p>

<div data-repeat="properties">
<p>A parcel/s of land located at {{location}}, covered by Transfer Certificate of Title (TCT) Number/s {{tctNo}}, consisting of {{areaSqm}} square meters.</p>
<p><b>TECHNICAL DESCRIPTION/S OF MORTGAGED PROPERTY/IES:</b></p>
<p>{{technicalDescription}}</p>
</div>

<p>That for, and in consideration of, this indebtedness, and to assure the performance of said obligation to pay, the MORTGAGOR hereby conveys by way of REAL ESTATE MORTGAGE unto the MORTGAGEE, his heirs and assigns, the real property described above, together with all existing improvements thereon.</p>

<p>That the condition of this obligation is that should the MORTGAGOR perform the obligation to pay the hereinabove-cited indebtedness of {{totalLoanAndCentavosInWords}} (Php {{totalLoan}}) together with accrued interest thereon, this mortgage shall at once become null and void and of no effect whatsoever; otherwise, it shall remain in full force and effect.</p>

<p>IN WITNESS WHEREOF, the parties have hereunto set their hands this {{executionDate}} at {{executionPlace}}, Philippines.</p>

<table><tbody><tr>
<td><b>{{companyName}}</b><br/>Represented by:<br/>____________________________<br/>{{lenderRepresentative}}<br/>Mortgagee</td>
<td>____________________________<br/><b>{{borrowerName}}</b><br/>Mortgagor</td>
</tr></tbody></table>

<p>IN THE PRESENCE OF:</p>
<table><tbody><tr><td>____________________________</td><td>____________________________</td></tr></tbody></table>

<p><b>AFFIDAVIT OF GOOD FAITH</b></p>
<p>We severally swear that the foregoing mortgage is made for the purpose of securing the obligation specified in the conditions thereof, and for no other purpose, and that the same is a just and valid obligation and one not entered into for the purpose of fraud.</p>
<table><tbody><tr>
<td><b>{{companyName}}</b><br/>Represented by:<br/>____________________________<br/>{{lenderRepresentative}}<br/>Mortgagee</td>
<td>____________________________<br/><b>{{borrowerName}}</b><br/>Mortgagor</td>
</tr></tbody></table>
<p>IN THE PRESENCE OF:</p>
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
<p>Known to me and to me known to be the same persons who executed the Real Estate Mortgage, consisting of two (2) pages including this page whereon this acknowledgement is written and signed by the parties on each page of this instrument.</p>
<p>WITNESS MY HAND AND SEAL on the date and place first above written.</p>
<p>Doc. No. {{notaryDocNo}};<br/>Page No. {{notaryPageNo}};<br/>Book No. {{notaryBookNo}};<br/>Series of {{notarySeries}}.</p>
$body$, 'published', now()
FROM public.document_templates t
WHERE t.slug = 'real_estate_mortgage';

-- ===========================================================================
-- 3. demand_letter  (replace with the "Notice to Pay" past-due letter)
-- ===========================================================================
UPDATE public.document_template_versions v SET status = 'archived'
  FROM public.document_templates t
 WHERE v.template_id = t.id AND t.slug = 'demand_letter' AND v.status = 'published';

INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT t.id,
       COALESCE((SELECT MAX(version_no) FROM public.document_template_versions WHERE template_id = t.id), 0) + 1,
       $body$
<div style="text-align:center"><h2>{{companyName}}</h2></div>
<p style="text-align:center">4th Floor Carson Building, Orense Corner Del Carmen St., Guadalupe Nuevo, Makati City</p>
<p style="text-align:right">{{todayDate}}</p>

<p><b>{{borrowerName}}</b><br/>{{address}}</p>

<p><b>RE: {{demandStage}}</b><br/>(LOAN NO. {{loanAccountNo}})</p>

<p>Dear Sir/Madam,</p>

<p data-unless="isFinal">I am writing on behalf of our company, {{companyName}} (with brevity name LSLGC), informing you that despite our first notice which was sent to you dated {{firstNoticeDate}}, we still have not received any payment from you as of this date. Based on our record, your account is already past due by {{daysPastDue}} day(s) as of {{todayDate}}, amounting to {{amountInWords}} (PHP {{outstandingBalance}}).</p>

<p data-if="isFinal">I am writing on behalf of our company, {{companyName}} (with brevity name LSLGC), informing you that this is your FINAL DEMAND LETTER since we have already been calling your attention many times and sending you notices, yet we have not received any payment from your end. Based on our record, your past due is already amounting to {{amountInWords}} (PHP {{outstandingBalance}}).</p>

<p>In view thereof, may we make a<span data-if="isFinal"> final</span> demand for you to pay in full your outstanding obligation within seven (7) days from the receipt of this letter, the said amount plus the penalty incurred for the delayed payment amounting to PHP {{penaltyAmount}}. Your total outstanding obligation to pay is amounting to PHP {{totalAmountDue}}, on or before {{paymentDeadline}}. Otherwise, your account will be transferred to our legal department to constrain necessary legal action/s against you in court for collection of the abovementioned sum plus the contractual interests and penalties and recovery of damages, legal interests, and attorney's fees to protect the rights and interests of the company.</p>

<p data-unless="isFinal">This notice will serve as a warning. It would be prudent for you to give preferential attention to this matter.</p>
<p data-if="isFinal">This FINAL DEMAND LETTER will serve as your final warning. It would be prudent for you to give preferential attention to this matter.</p>

<table><tbody><tr>
<td>Sincerely yours,<br/>&nbsp;<br/>____________________________<br/>Collection Department</td>
<td>Received by:<br/>&nbsp;<br/>____________________________<br/>Signature Over Printed Name</td>
</tr></tbody></table>
$body$, 'published', now()
FROM public.document_templates t
WHERE t.slug = 'demand_letter';

-- ===========================================================================
-- 4. demand_letter_dishonored_check  (NEW — admin-editable)
-- ===========================================================================
INSERT INTO public.document_templates (slug, name, description, category,
                                       seafarer_generation, sme_generation)
VALUES (
  'demand_letter_dishonored_check',
  'Demand Letter — Dishonored Check/s',
  'Final demand to redeem in cash the value of post-dated checks that were dishonored by the drawee bank. Admin-editable; not wired to the collector demand-letter generator.',
  'collection', 'hidden', 'optional'
)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description, category = EXCLUDED.category,
      seafarer_generation = EXCLUDED.seafarer_generation, sme_generation = EXCLUDED.sme_generation;

INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT t.id, 1, $body$
<p><b>{{borrowerName}}</b><br/>{{address}}</p>
<p data-if="borrowerRepresentative"><b>Attention:</b> {{borrowerRepresentative}}<br/>{{borrowerRepresentativeTitle}}</p>

<p><b>Re: Dishonored check/s</b></p>

<p>Dear Sir/Madam,</p>

<p>For value received, you issued and delivered to {{companyName}} the following checks drawn against your account no. {{demandCheckAccountNo}}. Said checks have the following details:</p>

<table><tbody>
<tr><th>Bank</th><th>Check Number</th><th>Date</th><th>Amount</th></tr>
<tr data-repeat="demandChecks"><td>{{bankName}}</td><td>{{checkNumber}}</td><td>{{checkDate}}</td><td>{{amount}}</td></tr>
</tbody></table>

<p>However, when the aforesaid checks were presented for payment when due, the same were dishonored and returned by the drawee bank for the reason: {{demandReason}}.</p>

<p>In view thereof, final demand is hereby made upon you to redeem in cash the full value of the aforesaid checks including the penalties and interest thereon within five (5) days from receipt hereof. Should you fail to do so, the company shall be constrained to institute the appropriate legal action against you.</p>

<p>Kindly give this matter your urgent attention.</p>

<table><tbody><tr>
<td>Very truly yours,<br/>&nbsp;<br/>____________________________<br/>{{companyName}}</td>
<td>Received by:<br/>&nbsp;<br/>____________________________<br/>Signature Over Printed Name</td>
</tr></tbody></table>
$body$, 'published', now()
FROM public.document_templates t
WHERE t.slug = 'demand_letter_dishonored_check'
  AND NOT EXISTS (
    SELECT 1 FROM public.document_template_versions v
    WHERE v.template_id = t.id AND v.version_no = 1
  );

-- ===========================================================================
-- 5. loan_agreement_vienovo  (NEW — quarterly / every-2-months product)
-- ===========================================================================
INSERT INTO public.document_templates (slug, name, description, category,
                                       seafarer_generation, sme_generation)
VALUES (
  'loan_agreement_vienovo',
  'Loan Agreement (Vienovo — quarterly / every 2 months)',
  'Loan Agreement variant with a quarterly (or every-2-months) amortization schedule, simplified security, and a 60-day termination-notice pre-termination clause.',
  'release', 'hidden', 'optional'
)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description, category = EXCLUDED.category,
      seafarer_generation = EXCLUDED.seafarer_generation, sme_generation = EXCLUDED.sme_generation;

INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT t.id, 1, $body$
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
<p>Upon execution of this agreement, the Borrower shall issue to the Lender {{numberOfPdcsInWords}} Post-Dated Checks in favor of the Lender, to be deposited as dated for payment towards the amortization of the loan.</p>

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
$body$, 'published', now()
FROM public.document_templates t
WHERE t.slug = 'loan_agreement_vienovo'
  AND NOT EXISTS (
    SELECT 1 FROM public.document_template_versions v
    WHERE v.template_id = t.id AND v.version_no = 1
  );
