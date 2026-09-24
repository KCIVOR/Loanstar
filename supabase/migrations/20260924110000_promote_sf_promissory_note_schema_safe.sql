-- Replace the promissory_note body with a schema-safe SF PN.doc-faithful transcription (see tiptap-roundtrip.test.mts: promissory_note_source_faithful).
-- Idempotent: archives the current published body only if different, then
-- inserts the reviewed body as a new published version only if not already
-- present verbatim. Never applied automatically — see AGENTS.md instructions
-- for this document-fidelity phase.

WITH reviewed_body AS (
  SELECT $pn$
<div data-accurate data-document-footer="none">
<div data-align="right"><img class="doc-logo" src="logo.png" alt="Loan Star Lending Group Corp." width="160"></div>
<p>PN Number: <b><u>{{promissoryNoteNo}}</u></b></p>
<h2 data-align="center">PROMISSORY NOTE</h2>

<p>For value received, I/we, jointly and severally, promise to pay <b>LOAN STAR LENDING GROUP CORP.</b> or order the sum of PHILIPPINE PESOS: <u>{{principalAndCentavosInWords}}</u> (<u>Php {{principal}}</u>) principal amount with an interest rate of <u>{{interestRateInWords}}</u> per month or a fraction thereof for <u>{{addonMonthsInWords}}</u> months from <u>{{disclosureFromDate}}</u> to <u>{{disclosureToDate}}</u>. The total loan amounts to <u>{{totalLoanAndCentavosInWords}}</u> (<u>Php {{totalLoan}}</u>) payable in <u>{{termsInWords}}</u> months, representing monthly amortization of PHILIPPINE PESOS: <u>{{monthlyAmortizationAndCentavosInWords}}</u> (<u>Php {{monthlyAmortization}}</u>); the payment will start on <u>{{firstPaymentDate}}</u> and a like amount every month thereafter until <u>{{loanMaturityDate}}</u>. I/We shall issue post-dated checks (PDCs) drawn from my/our checking bank account in the Philippines not later than <u>{{executionDate}}</u>. Failure to do so constitutes a default.</p>

<p>In case of any default in payment as herein agreed, the entire balance of this note shall become immediately due and demandable, at the option of the holder. Each party to this note, whether as borrower or co-borrower, severally waives presentation of payment, demand, protest and notice of protest and dishonor of the same. A late payment charge of <u>Five</u> percent (<u>5%</u>) penalty per month or a fraction thereof on the amount due. I/We understand that I will be charged an additional of PHILIPPINE PESOS: Three Thousand Pesos (Php 3,000.00) bounce check fee on the amount due.</p>

<p>I/We understand that I/We may pre-terminate this loan agreement with <b>LOAN STAR LENDING GROUP CORP.</b>, provided that I/We pay the loan in full together with accrued interest thereon up to the prepayment date, including a termination fee equivalent to one (1) month's interest under this note.</p>

<p>Furthermore, I/We acknowledge that a cooling-off period is available for a duration of five (5) days following the release of the loan proceeds. Should I/We decide to cancel the loan within this period, I/We remain obligated to pay the full amount of the Processing Fee as initially disclosed and agreed upon. After the lapse of the 5-day cooling-off period, the standard pre-termination terms and fees shall apply.</p>

<p>I/We hereby expressly consent to any extension, substitution, surrender of collateral, if any, forbearance and / or renewals hereof in whole or in part and / or partial payments on this note which may be granted to any one of us without notice and / or without consent and without the need of executing a new or a renewal note; and therefore, such fact shall not relieve me / us from my/our liability under this note.</p>

<p>It is understood that any partial payment or performance on this note or any extension granted will not alter or vary the terms of the original conditions of the obligation nor discharge the same and such partial payment or performance shall be considered as a written acknowledgement of this obligation which shall interrupt the period of prescription. For such partial payment or extension granted, I/We jointly and severally agree to pay a penalty of <u>Five</u> percent (<u>5%</u>) per month or a fraction thereof on the outstanding balance. In addition, in the event that I/we have delayed payment in any of the scheduled amortization payments, the security fee deposit shall be deemed forfeited for refund.</p>

<p>It is further agreed by party hereto, that in case payment shall not be made for at least two (2) monthly amortizations, I/We shall pay, in addition to the aggregate of the principal amount, interest due, and penalty, the cost of collection (third-party collection), and attorney's fees in an amount based on their actual billing, but such charge in no event to be less than PHILIPPINE PESOS: Three Thousand Pesos (Php 3,000.00).</p>

<p>Upon the separation of the borrower with his/her employer, <b>LOAN STAR LENDING GROUP CORP.</b> reserves the right to collect the balance of the principal in addition to all outstanding and accrued interest and charges from the borrower's last pay. I/We hereby appoint <b>LOAN STAR LENDING GROUP CORP.</b>, as our attorney-in-fact to collect the same and hereby confirm and ratify all the acts of my attorney by virtue hereof.</p>

<p>I/We expressly agree that all legal actions arising out of this NOTE may be brought in or submitted exclusively to the jurisdiction of the proper court of Makati City or anywhere in the Philippines at the discretion of <b>LOAN STAR LENDING GROUP CORP.</b> The parties are hereby waiving any other venue. I/We acknowledge having carefully read and understood the entire promissory note prior to affixing my/our signature thereon and agree to all the terms and conditions as stipulated therein.</p>

<table data-plain><tbody>
<tr>
<td data-align="center"><b><u>{{borrowerName}}</u></b><br/>BORROWER<br/><i>(Signature Over printed Name)</i></td>
<td data-align="center"><b><u>{{coBorrowerName}}</u></b><br/>CO-BORROWER<br/><i>(Signature Over printed Name)</i></td>
</tr>
</tbody></table>

<p>SUBSCRIBED AND SWORN TO BEFORE ME, this __________day of ______________, 20___ affiant exhibiting to me the following:</p>

<table data-plain><tbody>
<tr><th data-align="center">NAME</th><th data-align="center">VALID ID</th><th data-align="center">Place and Date of Issue</th></tr>
<tr><td data-underline>{{borrowerName}}</td><td data-underline>&nbsp;</td><td data-underline>&nbsp;</td></tr>
<tr><td data-underline>{{coBorrowerName}}</td><td data-underline>&nbsp;</td><td data-underline>&nbsp;</td></tr>
</tbody></table>

<p>Doc. No. {{notaryDocNo}};<br/>Page No. {{notaryPageNo}};<br/>Book No. {{notaryBookNo}};<br/>Series of {{notarySeries}}.</p>

<div data-align="right"><p>____________________________<br/>NOTARY PUBLIC</p></div>
</div>
$pn$::text AS body
)
UPDATE public.document_template_versions v SET status = 'archived'
  FROM public.document_templates t, reviewed_body b
 WHERE v.template_id = t.id
   AND t.slug = 'promissory_note'
   AND v.status = 'published'
   AND v.body IS DISTINCT FROM b.body;

WITH reviewed_body AS (
  SELECT $pn$
<div data-accurate data-document-footer="none">
<div data-align="right"><img class="doc-logo" src="logo.png" alt="Loan Star Lending Group Corp." width="160"></div>
<p>PN Number: <b><u>{{promissoryNoteNo}}</u></b></p>
<h2 data-align="center">PROMISSORY NOTE</h2>

<p>For value received, I/we, jointly and severally, promise to pay <b>LOAN STAR LENDING GROUP CORP.</b> or order the sum of PHILIPPINE PESOS: <u>{{principalAndCentavosInWords}}</u> (<u>Php {{principal}}</u>) principal amount with an interest rate of <u>{{interestRateInWords}}</u> per month or a fraction thereof for <u>{{addonMonthsInWords}}</u> months from <u>{{disclosureFromDate}}</u> to <u>{{disclosureToDate}}</u>. The total loan amounts to <u>{{totalLoanAndCentavosInWords}}</u> (<u>Php {{totalLoan}}</u>) payable in <u>{{termsInWords}}</u> months, representing monthly amortization of PHILIPPINE PESOS: <u>{{monthlyAmortizationAndCentavosInWords}}</u> (<u>Php {{monthlyAmortization}}</u>); the payment will start on <u>{{firstPaymentDate}}</u> and a like amount every month thereafter until <u>{{loanMaturityDate}}</u>. I/We shall issue post-dated checks (PDCs) drawn from my/our checking bank account in the Philippines not later than <u>{{executionDate}}</u>. Failure to do so constitutes a default.</p>

<p>In case of any default in payment as herein agreed, the entire balance of this note shall become immediately due and demandable, at the option of the holder. Each party to this note, whether as borrower or co-borrower, severally waives presentation of payment, demand, protest and notice of protest and dishonor of the same. A late payment charge of <u>Five</u> percent (<u>5%</u>) penalty per month or a fraction thereof on the amount due. I/We understand that I will be charged an additional of PHILIPPINE PESOS: Three Thousand Pesos (Php 3,000.00) bounce check fee on the amount due.</p>

<p>I/We understand that I/We may pre-terminate this loan agreement with <b>LOAN STAR LENDING GROUP CORP.</b>, provided that I/We pay the loan in full together with accrued interest thereon up to the prepayment date, including a termination fee equivalent to one (1) month's interest under this note.</p>

<p>Furthermore, I/We acknowledge that a cooling-off period is available for a duration of five (5) days following the release of the loan proceeds. Should I/We decide to cancel the loan within this period, I/We remain obligated to pay the full amount of the Processing Fee as initially disclosed and agreed upon. After the lapse of the 5-day cooling-off period, the standard pre-termination terms and fees shall apply.</p>

<p>I/We hereby expressly consent to any extension, substitution, surrender of collateral, if any, forbearance and / or renewals hereof in whole or in part and / or partial payments on this note which may be granted to any one of us without notice and / or without consent and without the need of executing a new or a renewal note; and therefore, such fact shall not relieve me / us from my/our liability under this note.</p>

<p>It is understood that any partial payment or performance on this note or any extension granted will not alter or vary the terms of the original conditions of the obligation nor discharge the same and such partial payment or performance shall be considered as a written acknowledgement of this obligation which shall interrupt the period of prescription. For such partial payment or extension granted, I/We jointly and severally agree to pay a penalty of <u>Five</u> percent (<u>5%</u>) per month or a fraction thereof on the outstanding balance. In addition, in the event that I/we have delayed payment in any of the scheduled amortization payments, the security fee deposit shall be deemed forfeited for refund.</p>

<p>It is further agreed by party hereto, that in case payment shall not be made for at least two (2) monthly amortizations, I/We shall pay, in addition to the aggregate of the principal amount, interest due, and penalty, the cost of collection (third-party collection), and attorney's fees in an amount based on their actual billing, but such charge in no event to be less than PHILIPPINE PESOS: Three Thousand Pesos (Php 3,000.00).</p>

<p>Upon the separation of the borrower with his/her employer, <b>LOAN STAR LENDING GROUP CORP.</b> reserves the right to collect the balance of the principal in addition to all outstanding and accrued interest and charges from the borrower's last pay. I/We hereby appoint <b>LOAN STAR LENDING GROUP CORP.</b>, as our attorney-in-fact to collect the same and hereby confirm and ratify all the acts of my attorney by virtue hereof.</p>

<p>I/We expressly agree that all legal actions arising out of this NOTE may be brought in or submitted exclusively to the jurisdiction of the proper court of Makati City or anywhere in the Philippines at the discretion of <b>LOAN STAR LENDING GROUP CORP.</b> The parties are hereby waiving any other venue. I/We acknowledge having carefully read and understood the entire promissory note prior to affixing my/our signature thereon and agree to all the terms and conditions as stipulated therein.</p>

<table data-plain><tbody>
<tr>
<td data-align="center"><b><u>{{borrowerName}}</u></b><br/>BORROWER<br/><i>(Signature Over printed Name)</i></td>
<td data-align="center"><b><u>{{coBorrowerName}}</u></b><br/>CO-BORROWER<br/><i>(Signature Over printed Name)</i></td>
</tr>
</tbody></table>

<p>SUBSCRIBED AND SWORN TO BEFORE ME, this __________day of ______________, 20___ affiant exhibiting to me the following:</p>

<table data-plain><tbody>
<tr><th data-align="center">NAME</th><th data-align="center">VALID ID</th><th data-align="center">Place and Date of Issue</th></tr>
<tr><td data-underline>{{borrowerName}}</td><td data-underline>&nbsp;</td><td data-underline>&nbsp;</td></tr>
<tr><td data-underline>{{coBorrowerName}}</td><td data-underline>&nbsp;</td><td data-underline>&nbsp;</td></tr>
</tbody></table>

<p>Doc. No. {{notaryDocNo}};<br/>Page No. {{notaryPageNo}};<br/>Book No. {{notaryBookNo}};<br/>Series of {{notarySeries}}.</p>

<div data-align="right"><p>____________________________<br/>NOTARY PUBLIC</p></div>
</div>
$pn$::text AS body
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT t.id,
       COALESCE((SELECT MAX(version_no) FROM public.document_template_versions WHERE template_id = t.id), 0) + 1,
       b.body,
       'published',
       now()
  FROM public.document_templates t
 CROSS JOIN reviewed_body b
 WHERE t.slug = 'promissory_note'
   AND NOT EXISTS (
     SELECT 1 FROM public.document_template_versions v
      WHERE v.template_id = t.id AND v.body = b.body
   );
