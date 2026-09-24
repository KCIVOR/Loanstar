-- Replace the demand_letter_second_notice body with a schema-safe SF DL2 - No address.doc-faithful transcription (see tiptap-roundtrip.test.mts: demand_letter_second_notice_source_faithful).
-- Idempotent: archives the current published body only if different, then
-- inserts the reviewed body as a new published version only if not already
-- present verbatim. Never applied automatically — see AGENTS.md instructions
-- for this document-fidelity phase.

WITH reviewed_body AS (
  SELECT $dl2$
<div data-accurate data-document-footer="none">
<p><b>{{borrowerName}}</b></p>

<p>Re: Dishonored check/s</p>

<p>Dear {{borrowerName}},</p>

<p>For value received, you issued and delivered to Loan Star Lending Group Corp. the following checks drawn against your account no. <u>{{loanAccountNo}}</u>. Said Check has the following details:</p>

<table data-plain><tbody>
<tr><th data-align="center">BANK</th><th data-align="center">CHECK NUMBER</th><th data-align="center">DATE</th><th data-align="center">AMOUNT</th></tr>
<tr data-repeat="bouncedChecks"><td>{{bankName}}</td><td>{{checkNumber}}</td><td>{{checkDate}}</td><td data-align="right">{{amount}}</td></tr>
</tbody></table>

<p>However, when the aforesaid checks were presented for payment when due, the same were dishonored and returned by the drawee bank for the reason:</p>

<p>____________________________</p>

<p>In view thereof, final demand is hereby made upon you to redeem in cash the full value of the aforesaid checks including the penalties and interest thereon within 5 days the receipt hereof. Should you fail to do so, the company shall be constrained to institute the appropriate legal action against you.</p>

<p>Kindly give this matter your urgent attention.</p>

<p>Very truly yours,</p>

<p>____________________________<br/>Collection Department</p>
</div>
$dl2$::text AS body
)
UPDATE public.document_template_versions v SET status = 'archived'
  FROM public.document_templates t, reviewed_body b
 WHERE v.template_id = t.id
   AND t.slug = 'demand_letter_second_notice'
   AND v.status = 'published'
   AND v.body IS DISTINCT FROM b.body;

WITH reviewed_body AS (
  SELECT $dl2$
<div data-accurate data-document-footer="none">
<p><b>{{borrowerName}}</b></p>

<p>Re: Dishonored check/s</p>

<p>Dear {{borrowerName}},</p>

<p>For value received, you issued and delivered to Loan Star Lending Group Corp. the following checks drawn against your account no. <u>{{loanAccountNo}}</u>. Said Check has the following details:</p>

<table data-plain><tbody>
<tr><th data-align="center">BANK</th><th data-align="center">CHECK NUMBER</th><th data-align="center">DATE</th><th data-align="center">AMOUNT</th></tr>
<tr data-repeat="bouncedChecks"><td>{{bankName}}</td><td>{{checkNumber}}</td><td>{{checkDate}}</td><td data-align="right">{{amount}}</td></tr>
</tbody></table>

<p>However, when the aforesaid checks were presented for payment when due, the same were dishonored and returned by the drawee bank for the reason:</p>

<p>____________________________</p>

<p>In view thereof, final demand is hereby made upon you to redeem in cash the full value of the aforesaid checks including the penalties and interest thereon within 5 days the receipt hereof. Should you fail to do so, the company shall be constrained to institute the appropriate legal action against you.</p>

<p>Kindly give this matter your urgent attention.</p>

<p>Very truly yours,</p>

<p>____________________________<br/>Collection Department</p>
</div>
$dl2$::text AS body
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT t.id,
       COALESCE((SELECT MAX(version_no) FROM public.document_template_versions WHERE template_id = t.id), 0) + 1,
       b.body,
       'published',
       now()
  FROM public.document_templates t
 CROSS JOIN reviewed_body b
 WHERE t.slug = 'demand_letter_second_notice'
   AND NOT EXISTS (
     SELECT 1 FROM public.document_template_versions v
      WHERE v.template_id = t.id AND v.body = b.body
   );
