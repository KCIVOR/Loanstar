-- Fix voluntary_surrender_deed_auto's TWO vehicle detail blocks (the
-- "VEHICLE INFO" table in the Voluntary Surrender Form / Annex "C", and the
-- vehicle-description table in the Deed of Absolute Sale / Annex "D"): same
-- bug as the sibling chattel-mortgage fixes in this phase -- both rendered
-- as ONE wide table with a header row and `<tr data-repeat="vehicles">`
-- cloning one data row per vehicle.
--
-- Checked against the real source `.doc` files (`Voluntary and Deed Auto -
-- Unit 1/2/3/4.doc`, LSLGC Calculator and Docs), extracted with antiword:
-- each source shows a 7-row (VEHICLE INFO, with Registered Owner) and a
-- 6-row (Deed of Absolute Sale, no Registered Owner -- matches this
-- document's own source) key/value table -- never a wide table with a
-- header row. ("Unit N" distinguishes 4 different sample vehicles/
-- borrowers, not a 1-4 multi-vehicle count-variant -- voluntary surrender
-- is executed per vehicle -- so every source file carries exactly one
-- vehicle; the fix still keeps both blocks as `data-repeat`, not hardcoded
-- to one item, so a loan with more than one CI-inspected vehicle renders
-- correctly too, consistent with the sibling templates and the `vehicles[]`
-- merge-context shape in collateral-context.ts.)
--
-- Fixed both occurrences the same way as the sibling templates:
-- `<div data-repeat="vehicles">` wrapping a per-vehicle key/value table.
-- Rendered through the real Gotenberg pipeline with 1 and 2 sample vehicles
-- and visually compared against the source's own layout -- matches exactly
-- for both blocks.
--
-- Nothing else in the published body changed: surrender terms, Deed of
-- Absolute Sale prose, acknowledgments, and the Annex "C"/"D" page break
-- were spot-checked against the source and already matched.
--
-- See tiptap-roundtrip.test.mts: voluntary_surrender_deed_auto_source_faithful.
-- Idempotent: archives the current published body only if different, then
-- inserts the reviewed body as a new published version only if not already
-- present verbatim. Never applied automatically -- see AGENTS.md
-- instructions for this document-fidelity phase.

WITH reviewed_body AS (
  SELECT $vsda$
<p style="text-align:right"><b>ANNEX &ldquo;C&rdquo;</b></p>
<h2 style="text-align:center">VOLUNTARY SURRENDER FORM</h2>

<p>I, <b>{{borrowerName}}</b>, with principal address at {{address}}, hereby, voluntarily surrender the vehicle to <b>{{companyName}}</b>, as full/partial payment of my debt in the amount of {{surrenderDebtAmountInWords}} (Php {{surrenderDebtAmount}}); below are the details of my unit:</p>

<p><b>VEHICLE INFO:</b></p>
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

<p>As such both parties agreed to the following terms and condition to wit:</p>
<p>That both parties agreed on the value of the property based on prevailing market rate from the time vehicle surrendered to {{companyName}} to be written at the above paragraph;</p>
<p>That this instrument will be executed after two (2) months default of payment even the loan is not yet matured;</p>
<p>That in consideration {{companyName}} will give a redemption period of {{redemptionPeriod}} to settle the above outstanding balance;</p>
<p>That I am giving full authority to the {{companyName}} to execute the Deed of Sale once I did not settle my obligation on a given redemption period;</p>
<p>That I waived all my rights as owner of the said vehicle after execution of deed of sale;</p>
<p>The above voluntary surrender with terms and condition is executed by the undersigned voluntarily with full knowledge and understanding.</p>

<table><tbody><tr>
<td>____________________________<br/><b>{{borrowerName}}</b><br/>Date ______________________</td>
<td><b>{{companyName}}</b><br/>Represented by:<br/>____________________________<br/>Date ______________________</td>
</tr></tbody></table>

<p><b>Witnesses:</b></p>
<table><tbody><tr>
<td>____________________________<br/>{{witnessOne}}</td>
<td>____________________________<br/>{{witnessTwo}}</td>
</tr></tbody></table>

<p><b>ACKNOWLEDGEMENT</b></p>
<p>REPUBLIC OF THE PHILIPPINES&nbsp;)<br/>_____________________________&nbsp;) S.S.</p>
<p>BEFORE ME, a Notary Public for and in the City of {{executionPlace}} on this {{executionDate}} personally appeared:</p>
<table><tbody>
<tr><th>Name</th><th>ID / Card Number</th><th>Validity</th></tr>
<tr><td>{{companyName}}</td><td>TIN {{lenderTin}}</td><td></td></tr>
<tr><td>{{borrowerName}}</td><td>TIN {{borrowerTin}}</td><td></td></tr>
</tbody></table>
<p>Known to me and to me known to be the same persons who executed the foregoing Voluntary Surrender Form, consisting of two (2) pages including this page whereon this acknowledgement is written and signed by the parties on each page of this instrument.</p>
<p>WITNESS MY HAND AND SEAL on the date and place first above written.</p>
<p>Doc. No. {{notaryDocNo}};<br/>Page No. {{notaryPageNo}};<br/>Book No. {{notaryBookNo}};<br/>Series of {{notarySeries}}.</p>

<hr/>
<p style="text-align:right"><b>ANNEX &ldquo;D&rdquo;</b></p>
<h2 style="text-align:center">DEED OF ABSOLUTE SALE</h2>

<p><b>KNOW ALL MEN BY THESE PRESENTS:</b></p>
<p>I, <b>{{borrowerName}}</b>, of legal age, with postal address at {{address}}, and the registered and lawful owner of a certain Motor Vehicle described as follows:</p>
<div data-repeat="vehicles">
<table><tbody>
<tr><th>Make / Year Model</th><td>{{makeYearModel}}</td></tr>
<tr><th>Engine No.</th><td>{{engineNo}}</td></tr>
<tr><th>Chassis No.</th><td>{{chassisNo}}</td></tr>
<tr><th>Plate No.</th><td>{{plateNo}}</td></tr>
<tr><th>CR No.</th><td>{{crNo}}</td></tr>
<tr><th>MV File No.</th><td>{{mvFileNo}}</td></tr>
</tbody></table>
</div>
<p>That for and in consideration of the total sum of {{surrenderDebtAmountInWords}} (P {{surrenderDebtAmount}}), paid in full by {{companyName}}, with address at {{lenderAddress}}, receipt of which is hereby acknowledged by me to my full satisfaction, I hereby by these presents, sell, cede, convey and otherwise dispose of the above-described vehicle unto VENDEE, its heirs, successors and assigns, free from all liens and encumbrances. Further, said sale is on an &ldquo;as is, where is&rdquo; basis.</p>
<p>I warrant that the herein property being sold is not among the carnapped, wanted or stolen vehicles and further undertake to defend the VENDEE from the lawful claim of any person whatsoever.</p>
<p>IN WITNESS WHEREOF, I have hereunder set my hands this {{executionDate}} at {{executionPlace}}, Philippines.</p>
<table><tbody><tr>
<td>VENDOR:<br/>____________________________<br/><b>{{borrowerName}}</b><br/>TIN {{borrowerTin}}</td>
<td>VENDEE:<br/>____________________________<br/><b>{{companyName}}</b><br/>TIN {{lenderTin}}</td>
</tr></tbody></table>
<p>Signed in the presence of</p>
<table><tbody><tr>
<td>____________________________<br/>{{witnessOne}}</td>
<td>____________________________<br/>{{witnessTwo}}</td>
</tr></tbody></table>
<p><b>ACKNOWLEDGEMENT</b></p>
<p>REPUBLIC OF THE PHILIPPINES&nbsp;) S.S.</p>
<p>BEFORE ME, a Notary for and in {{executionPlace}}, Philippines, personally appeared this {{executionDate}}, the VENDOR, known to me to be the same person who executed the foregoing instrument and acknowledged before me that the same is his free and voluntary act and deed.</p>
<p>WITNESS MY HAND AND SEAL, on the date and place first above written.</p>
<p>Doc. No. {{notaryDocNo}};<br/>Page No. {{notaryPageNo}};<br/>Book No. {{notaryBookNo}};<br/>Series of {{notarySeries}}.</p>
$vsda$::text AS body
)
UPDATE public.document_template_versions v SET status = 'archived'
  FROM public.document_templates t, reviewed_body b
 WHERE v.template_id = t.id
   AND t.slug = 'voluntary_surrender_deed_auto'
   AND v.status = 'published'
   AND v.body IS DISTINCT FROM b.body;

WITH reviewed_body AS (
  SELECT $vsda$
<p style="text-align:right"><b>ANNEX &ldquo;C&rdquo;</b></p>
<h2 style="text-align:center">VOLUNTARY SURRENDER FORM</h2>

<p>I, <b>{{borrowerName}}</b>, with principal address at {{address}}, hereby, voluntarily surrender the vehicle to <b>{{companyName}}</b>, as full/partial payment of my debt in the amount of {{surrenderDebtAmountInWords}} (Php {{surrenderDebtAmount}}); below are the details of my unit:</p>

<p><b>VEHICLE INFO:</b></p>
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

<p>As such both parties agreed to the following terms and condition to wit:</p>
<p>That both parties agreed on the value of the property based on prevailing market rate from the time vehicle surrendered to {{companyName}} to be written at the above paragraph;</p>
<p>That this instrument will be executed after two (2) months default of payment even the loan is not yet matured;</p>
<p>That in consideration {{companyName}} will give a redemption period of {{redemptionPeriod}} to settle the above outstanding balance;</p>
<p>That I am giving full authority to the {{companyName}} to execute the Deed of Sale once I did not settle my obligation on a given redemption period;</p>
<p>That I waived all my rights as owner of the said vehicle after execution of deed of sale;</p>
<p>The above voluntary surrender with terms and condition is executed by the undersigned voluntarily with full knowledge and understanding.</p>

<table><tbody><tr>
<td>____________________________<br/><b>{{borrowerName}}</b><br/>Date ______________________</td>
<td><b>{{companyName}}</b><br/>Represented by:<br/>____________________________<br/>Date ______________________</td>
</tr></tbody></table>

<p><b>Witnesses:</b></p>
<table><tbody><tr>
<td>____________________________<br/>{{witnessOne}}</td>
<td>____________________________<br/>{{witnessTwo}}</td>
</tr></tbody></table>

<p><b>ACKNOWLEDGEMENT</b></p>
<p>REPUBLIC OF THE PHILIPPINES&nbsp;)<br/>_____________________________&nbsp;) S.S.</p>
<p>BEFORE ME, a Notary Public for and in the City of {{executionPlace}} on this {{executionDate}} personally appeared:</p>
<table><tbody>
<tr><th>Name</th><th>ID / Card Number</th><th>Validity</th></tr>
<tr><td>{{companyName}}</td><td>TIN {{lenderTin}}</td><td></td></tr>
<tr><td>{{borrowerName}}</td><td>TIN {{borrowerTin}}</td><td></td></tr>
</tbody></table>
<p>Known to me and to me known to be the same persons who executed the foregoing Voluntary Surrender Form, consisting of two (2) pages including this page whereon this acknowledgement is written and signed by the parties on each page of this instrument.</p>
<p>WITNESS MY HAND AND SEAL on the date and place first above written.</p>
<p>Doc. No. {{notaryDocNo}};<br/>Page No. {{notaryPageNo}};<br/>Book No. {{notaryBookNo}};<br/>Series of {{notarySeries}}.</p>

<hr/>
<p style="text-align:right"><b>ANNEX &ldquo;D&rdquo;</b></p>
<h2 style="text-align:center">DEED OF ABSOLUTE SALE</h2>

<p><b>KNOW ALL MEN BY THESE PRESENTS:</b></p>
<p>I, <b>{{borrowerName}}</b>, of legal age, with postal address at {{address}}, and the registered and lawful owner of a certain Motor Vehicle described as follows:</p>
<div data-repeat="vehicles">
<table><tbody>
<tr><th>Make / Year Model</th><td>{{makeYearModel}}</td></tr>
<tr><th>Engine No.</th><td>{{engineNo}}</td></tr>
<tr><th>Chassis No.</th><td>{{chassisNo}}</td></tr>
<tr><th>Plate No.</th><td>{{plateNo}}</td></tr>
<tr><th>CR No.</th><td>{{crNo}}</td></tr>
<tr><th>MV File No.</th><td>{{mvFileNo}}</td></tr>
</tbody></table>
</div>
<p>That for and in consideration of the total sum of {{surrenderDebtAmountInWords}} (P {{surrenderDebtAmount}}), paid in full by {{companyName}}, with address at {{lenderAddress}}, receipt of which is hereby acknowledged by me to my full satisfaction, I hereby by these presents, sell, cede, convey and otherwise dispose of the above-described vehicle unto VENDEE, its heirs, successors and assigns, free from all liens and encumbrances. Further, said sale is on an &ldquo;as is, where is&rdquo; basis.</p>
<p>I warrant that the herein property being sold is not among the carnapped, wanted or stolen vehicles and further undertake to defend the VENDEE from the lawful claim of any person whatsoever.</p>
<p>IN WITNESS WHEREOF, I have hereunder set my hands this {{executionDate}} at {{executionPlace}}, Philippines.</p>
<table><tbody><tr>
<td>VENDOR:<br/>____________________________<br/><b>{{borrowerName}}</b><br/>TIN {{borrowerTin}}</td>
<td>VENDEE:<br/>____________________________<br/><b>{{companyName}}</b><br/>TIN {{lenderTin}}</td>
</tr></tbody></table>
<p>Signed in the presence of</p>
<table><tbody><tr>
<td>____________________________<br/>{{witnessOne}}</td>
<td>____________________________<br/>{{witnessTwo}}</td>
</tr></tbody></table>
<p><b>ACKNOWLEDGEMENT</b></p>
<p>REPUBLIC OF THE PHILIPPINES&nbsp;) S.S.</p>
<p>BEFORE ME, a Notary for and in {{executionPlace}}, Philippines, personally appeared this {{executionDate}}, the VENDOR, known to me to be the same person who executed the foregoing instrument and acknowledged before me that the same is his free and voluntary act and deed.</p>
<p>WITNESS MY HAND AND SEAL, on the date and place first above written.</p>
<p>Doc. No. {{notaryDocNo}};<br/>Page No. {{notaryPageNo}};<br/>Book No. {{notaryBookNo}};<br/>Series of {{notarySeries}}.</p>
$vsda$::text AS body
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT t.id,
       COALESCE((SELECT MAX(version_no) FROM public.document_template_versions WHERE template_id = t.id), 0) + 1,
       b.body,
       'published',
       now()
  FROM public.document_templates t
 CROSS JOIN reviewed_body b
 WHERE t.slug = 'voluntary_surrender_deed_auto'
   AND NOT EXISTS (
     SELECT 1 FROM public.document_template_versions v
      WHERE v.template_id = t.id AND v.body = b.body
   );
