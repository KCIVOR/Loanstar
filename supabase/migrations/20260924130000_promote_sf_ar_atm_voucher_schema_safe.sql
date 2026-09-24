-- Replace the ar_atm_voucher body with a schema-safe transcription faithful to both SF AR ATM.doc and AR ATM - With Spouse.doc, unified via data-if="hasSpouse" (see tiptap-roundtrip.test.mts: ar_atm_voucher_source_faithful).
-- Idempotent: archives the current published body only if different, then
-- inserts the reviewed body as a new published version only if not already
-- present verbatim. Never applied automatically — see AGENTS.md instructions
-- for this document-fidelity phase.

WITH reviewed_body AS (
  SELECT $aratm$
<div data-accurate data-document-footer="none">
<div data-align="right"><img class="doc-logo" src="logo.png" alt="Loan Star Lending Group Corp." width="160"></div>
<h2 data-align="center">SURRENDER OF BANK ATM CARD</h2>

<p>I, <b><u>{{borrowerName}}</u></b> of legal age and residing at <b><u>{{address}}</u></b>, surrender my <b>Bank ATM Card</b> to <b><u>LOAN STAR LENDING GROUP CORP. (LSLGC for brevity)</u></b>, for payment of my loan in the sum of <b><u>{{totalLoanAndCentavosInWords}}</u></b> (<b><u>Php {{totalLoan}}</u></b>), Philippine currency, to be paid in <b><u>{{termsInWords}}</u></b> months term with monthly amortization of <b><u>{{monthlyAmortizationAndCentavosInWords}}</u></b> (<b><u>Php {{monthlyAmortization}}</u></b>). I accept and understood the Terms and Conditions that LSLGC will only withdraw and take the amount equivalent to my monthly amortization starting on <b><u>{{firstPaymentDate}}</u></b> and the succeeding monthly installments thereafter until the obligation is fully settled, without need of any further notice, demand, act or deed on the part of LSLGC.</p>

<p>My ATM Card details and status upon surrender;</p>

<table data-plain><tbody>
<tr><td>BANK NAME</td><td data-align="center">:</td><td data-underline>&nbsp;</td></tr>
<tr><td>CARD NUMBER</td><td data-align="center">:</td><td data-underline>&nbsp;</td></tr>
<tr><td>PIN</td><td data-align="center">:</td><td data-underline>&nbsp;</td></tr>
<tr><td>ACCOUNT TYPE</td><td data-align="center">:</td><td data-underline>&nbsp;</td></tr>
<tr><td>INITIAL BALANCE</td><td data-align="center">:</td><td data-underline>Php</td></tr>
<tr><td>REMARKS</td><td data-align="center">:</td><td data-underline>&nbsp;</td></tr>
</tbody></table>

<p>I further manifest, that I hereby waive all my rights, claims and/or cause of actions against LSLGC Directors, Stockholders, Officers, Staff and Representatives.</p>

<table data-plain><tbody>
<tr><td>BORROWER:</td><td>RECEIVED BY:</td></tr>
</tbody></table>

<table data-plain><tbody>
<tr>
<td data-align="center"><b>{{borrowerName}}</b><br/>____________________________<br/><i>(Signature Over printed Name)</i></td>
<td data-align="center">____________________________<br/><i>(Signature Over printed Name)</i></td>
</tr>
</tbody></table>

<div data-if="hasSpouse">
<p>SPOUSE:</p>
<table data-plain><tbody>
<tr><td data-align="center"><b>{{spouseName}}</b><br/>____________________________<br/><i>(Signature Over printed Name)</i></td></tr>
</tbody></table>
</div>
</div>
$aratm$::text AS body
)
UPDATE public.document_template_versions v SET status = 'archived'
  FROM public.document_templates t, reviewed_body b
 WHERE v.template_id = t.id
   AND t.slug = 'ar_atm_voucher'
   AND v.status = 'published'
   AND v.body IS DISTINCT FROM b.body;

WITH reviewed_body AS (
  SELECT $aratm$
<div data-accurate data-document-footer="none">
<div data-align="right"><img class="doc-logo" src="logo.png" alt="Loan Star Lending Group Corp." width="160"></div>
<h2 data-align="center">SURRENDER OF BANK ATM CARD</h2>

<p>I, <b><u>{{borrowerName}}</u></b> of legal age and residing at <b><u>{{address}}</u></b>, surrender my <b>Bank ATM Card</b> to <b><u>LOAN STAR LENDING GROUP CORP. (LSLGC for brevity)</u></b>, for payment of my loan in the sum of <b><u>{{totalLoanAndCentavosInWords}}</u></b> (<b><u>Php {{totalLoan}}</u></b>), Philippine currency, to be paid in <b><u>{{termsInWords}}</u></b> months term with monthly amortization of <b><u>{{monthlyAmortizationAndCentavosInWords}}</u></b> (<b><u>Php {{monthlyAmortization}}</u></b>). I accept and understood the Terms and Conditions that LSLGC will only withdraw and take the amount equivalent to my monthly amortization starting on <b><u>{{firstPaymentDate}}</u></b> and the succeeding monthly installments thereafter until the obligation is fully settled, without need of any further notice, demand, act or deed on the part of LSLGC.</p>

<p>My ATM Card details and status upon surrender;</p>

<table data-plain><tbody>
<tr><td>BANK NAME</td><td data-align="center">:</td><td data-underline>&nbsp;</td></tr>
<tr><td>CARD NUMBER</td><td data-align="center">:</td><td data-underline>&nbsp;</td></tr>
<tr><td>PIN</td><td data-align="center">:</td><td data-underline>&nbsp;</td></tr>
<tr><td>ACCOUNT TYPE</td><td data-align="center">:</td><td data-underline>&nbsp;</td></tr>
<tr><td>INITIAL BALANCE</td><td data-align="center">:</td><td data-underline>Php</td></tr>
<tr><td>REMARKS</td><td data-align="center">:</td><td data-underline>&nbsp;</td></tr>
</tbody></table>

<p>I further manifest, that I hereby waive all my rights, claims and/or cause of actions against LSLGC Directors, Stockholders, Officers, Staff and Representatives.</p>

<table data-plain><tbody>
<tr><td>BORROWER:</td><td>RECEIVED BY:</td></tr>
</tbody></table>

<table data-plain><tbody>
<tr>
<td data-align="center"><b>{{borrowerName}}</b><br/>____________________________<br/><i>(Signature Over printed Name)</i></td>
<td data-align="center">____________________________<br/><i>(Signature Over printed Name)</i></td>
</tr>
</tbody></table>

<div data-if="hasSpouse">
<p>SPOUSE:</p>
<table data-plain><tbody>
<tr><td data-align="center"><b>{{spouseName}}</b><br/>____________________________<br/><i>(Signature Over printed Name)</i></td></tr>
</tbody></table>
</div>
</div>
$aratm$::text AS body
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT t.id,
       COALESCE((SELECT MAX(version_no) FROM public.document_template_versions WHERE template_id = t.id), 0) + 1,
       b.body,
       'published',
       now()
  FROM public.document_templates t
 CROSS JOIN reviewed_body b
 WHERE t.slug = 'ar_atm_voucher'
   AND NOT EXISTS (
     SELECT 1 FROM public.document_template_versions v
      WHERE v.template_id = t.id AND v.body = b.body
   );
