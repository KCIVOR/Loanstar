-- Fix deed_of_chattel_mortgage's vehicle detail block: the published body
-- rendered all mortgaged vehicles as ONE wide table (a 7-label header row --
-- Make/Year Model, Engine No., Chassis No., Plate No., CR No., MV File No.,
-- Registered Owner -- then `<tr data-repeat="vehicles">` cloning one data
-- row per vehicle).
--
-- Checked against the real source `.doc` files (`CHATTEL MORTGAGE - 1
-- unit.doc` through `- 4 units.doc`, LSLGC Calculator and Docs), extracted
-- with antiword: every vehicle gets its OWN small 7-row x 2-column
-- key/value table (label | value, one row per field, in the same field
-- order/labels the published body already used) -- confirmed directly in
-- the "2 units" source, which shows two independent 7-row tables stacked
-- back-to-back, not one wide table with 2 data rows.
--
-- Fixed by wrapping the per-vehicle table in `<div data-repeat="vehicles">`
-- (the established `repeat_block` pattern -- see tiptap-roundtrip.
-- fixtures.ts -- the block-repeat equivalent of the already-correct
-- property-collateral family's `data-repeat="properties"` blocks) instead
-- of the old `<tr data-repeat="vehicles">` repeated-row pattern. Rendered
-- through the real Gotenberg pipeline with 1 and 2 sample vehicles and
-- visually compared against the source's own layout -- matches exactly.
--
-- Nothing else in the published body changed: the mortgagor/mortgagee
-- recitals, affidavit of good faith, and acknowledgment were spot-checked
-- against the same sources and already matched.
--
-- See tiptap-roundtrip.test.mts: deed_of_chattel_mortgage_source_faithful.
-- Idempotent: archives the current published body only if different, then
-- inserts the reviewed body as a new published version only if not already
-- present verbatim. Never applied automatically -- see AGENTS.md
-- instructions for this document-fidelity phase.

WITH reviewed_body AS (
  SELECT $docm$
<div data-compact-nudge>
<h2 style="text-align:center">CHATTEL MORTGAGE</h2>

<p>This CHATTEL MORTGAGE made and executed by:</p>

<p><b>{{borrowerName}}</b>, of legal age, with postal address at {{address}}, hereinafter known as the &ldquo;MORTGAGOR&rdquo;;</p>
<p>-and-</p>
<p><b>{{companyName}}</b>, a corporation established under Philippine law represented by its president, {{lenderRepresentative}}, with postal address at {{lenderAddress}}, hereinafter known as the &ldquo;MORTGAGEE&rdquo;,</p>

<p>witnesseth:</p>

<p>That the MORTGAGOR is indebted unto the MORTGAGEE in the sum of {{principalAndCentavosInWords}} (Php {{principal}}), Philippine Currency, receipt of which is acknowledged by the MORTGAGOR upon the signing of this instrument, payable within a period of {{termsInWords}} months, with interest thereon at the rate of {{interestRateInWords}} per month; below are the details of the vehicle/s:</p>

<div data-repeat="vehicles">
<table><tbody>
<tr><th>Make / Year Model</th><td>{{makeYearModel}}</td></tr>
<tr><th>Engine No.</th><td>{{engineNo}}</td></tr>
<tr><th>Chassis No.</th><td>{{chassisNo}}</td></tr>
<tr><th>Plate No.</th><td>{{plateNo}}</td></tr>
<tr><th>CR No.</th><td>{{crNo}}</td></tr>
<tr><th>MV File No.</th><td>{{mvFileNo}}</td></tr>
<tr><th>Registered Owner</th><td>{{registeredOwner}}</td></tr>
</tbody></table>
</div>

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
</div>
$docm$::text AS body
)
UPDATE public.document_template_versions v SET status = 'archived'
  FROM public.document_templates t, reviewed_body b
 WHERE v.template_id = t.id
   AND t.slug = 'deed_of_chattel_mortgage'
   AND v.status = 'published'
   AND v.body IS DISTINCT FROM b.body;

WITH reviewed_body AS (
  SELECT $docm$
<div data-compact-nudge>
<h2 style="text-align:center">CHATTEL MORTGAGE</h2>

<p>This CHATTEL MORTGAGE made and executed by:</p>

<p><b>{{borrowerName}}</b>, of legal age, with postal address at {{address}}, hereinafter known as the &ldquo;MORTGAGOR&rdquo;;</p>
<p>-and-</p>
<p><b>{{companyName}}</b>, a corporation established under Philippine law represented by its president, {{lenderRepresentative}}, with postal address at {{lenderAddress}}, hereinafter known as the &ldquo;MORTGAGEE&rdquo;,</p>

<p>witnesseth:</p>

<p>That the MORTGAGOR is indebted unto the MORTGAGEE in the sum of {{principalAndCentavosInWords}} (Php {{principal}}), Philippine Currency, receipt of which is acknowledged by the MORTGAGOR upon the signing of this instrument, payable within a period of {{termsInWords}} months, with interest thereon at the rate of {{interestRateInWords}} per month; below are the details of the vehicle/s:</p>

<div data-repeat="vehicles">
<table><tbody>
<tr><th>Make / Year Model</th><td>{{makeYearModel}}</td></tr>
<tr><th>Engine No.</th><td>{{engineNo}}</td></tr>
<tr><th>Chassis No.</th><td>{{chassisNo}}</td></tr>
<tr><th>Plate No.</th><td>{{plateNo}}</td></tr>
<tr><th>CR No.</th><td>{{crNo}}</td></tr>
<tr><th>MV File No.</th><td>{{mvFileNo}}</td></tr>
<tr><th>Registered Owner</th><td>{{registeredOwner}}</td></tr>
</tbody></table>
</div>

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
</div>
$docm$::text AS body
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT t.id,
       COALESCE((SELECT MAX(version_no) FROM public.document_template_versions WHERE template_id = t.id), 0) + 1,
       b.body,
       'published',
       now()
  FROM public.document_templates t
 CROSS JOIN reviewed_body b
 WHERE t.slug = 'deed_of_chattel_mortgage'
   AND NOT EXISTS (
     SELECT 1 FROM public.document_template_versions v
      WHERE v.template_id = t.id AND v.body = b.body
   );
