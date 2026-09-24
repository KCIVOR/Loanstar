-- Fix spa_mortgage_cancellation's vehicle detail block: the published body
-- rendered the mortgaged vehicle's collateral description as ONE wide table
-- (a 6-column header row -- Make/Series/Year Model, MV File No.,
-- Transmission, Engine No., Chassis No., Plate No. -- then
-- `<tr data-repeat="vehicles">` cloning one data row per vehicle), the same
-- anti-pattern already fixed across deed_of_chattel_mortgage,
-- cancellation_of_chattel_mortgage and voluntary_surrender_deed_auto in
-- Phase 4. It also referenced a `{{transmission}}` merge field that does not
-- exist anywhere in `buildReleaseTemplateContext`'s output (never wired --
-- would have rendered as a literal empty token).
--
-- Checked against the real source
-- `SPECIAL POWER OF ATTORNEY Cancellation of Mortgage.docx` /
-- `... (1).docx` (LSLGC Calculator and Docs, extracted with python-docx --
-- both are the same filled-sample template, one with the passport number
-- filled into the acknowledgment ID table and one without; otherwise
-- byte-identical prose): the vehicle description is a stacked label/value
-- list (Make / Series / Body Type, MV File No., Year Model, Transmission,
-- Engine Number, Chassis Number, Plate Number), one block per vehicle --
-- the same shape as the chattel-mortgage family's per-vehicle table, not a
-- wide table with repeated rows.
--
-- Fixed by replacing the wide table with the established
-- `<div data-repeat="vehicles">` block wrapping a 7-row key/value table,
-- using the same field set/order/labels already used by
-- deed_of_chattel_mortgage (makeYearModel, engineNo, chassisNo, plateNo,
-- crNo, mvFileNo, registeredOwner -- see collateral-context.ts's
-- `DocumentVehicleRow`, which explicitly lists spa_mortgage_cancellation
-- among the documents this collateral row shape feeds). The invented
-- `{{transmission}}` field is dropped -- no such key exists on
-- `DocumentVehicleRow` or `buildReleaseTemplateContext`'s output, and the
-- source's own "Transmission" line has no equivalent captured anywhere in
-- the system yet, so it is omitted rather than invented.
--
-- Nothing else in the published body changed: the principal/attorney-in-fact
-- recitals, powers granted, and acknowledgment were spot-checked against the
-- same source and already matched.
--
-- See tiptap-roundtrip.test.mts: spa_mortgage_cancellation_source_faithful.
-- Idempotent: archives the current published body only if different, then
-- inserts the reviewed body as a new published version only if not already
-- present verbatim. Never applied automatically -- see AGENTS.md
-- instructions for this document-fidelity phase.

WITH reviewed_body AS (
  SELECT $docm$
<div data-compact-nudge>
<h2 style="text-align:center">SPECIAL POWER OF ATTORNEY</h2>

<p><b>KNOW ALL MEN BY THESE PRESENTS:</b></p>

<p>I, <b>{{borrowerName}}</b>, of legal age, Filipino, and residing at {{address}}, do hereby name, constitute, and appoint:</p>

<p><b>{{companyName}}</b>, a corporation duly organized and existing under Philippine laws, with business address at {{lenderAddress}}, represented by its authorized officers and/or representatives, to be my true and lawful attorney-in-fact, for me and in my name, place, and stead, to perform and execute the following acts, deeds, and things:</p>

<p>1. To process, represent, facilitate, and secure the Cancellation of Chattel Mortgage over my motor vehicle with the Registry of Deeds (RD) and the Land Transportation Office (LTO), which vehicle is more particularly described as follows:</p>

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

<p>2. To sign, execute, submit, and receive any and all documents, applications, clearances, and certificates necessary for, or required by, the Registry of Deeds and the Land Transportation Office in connection with the cancellation of the said Chattel Mortgage and the updating of the vehicle's records;</p>
<p>3. To pay any and all required fees, assessments, and charges related to the cancellation of the mortgage; and</p>
<p>4. To perform all other acts necessary, convenient, or incidental to carry out the purposes stated above.</p>

<p>HEREBY GIVING AND GRANTING unto my said attorney-in-fact full power and authority to do and perform any and every act and thing whatsoever requisite, necessary, or proper to be done in and about the premises, as fully to all intents and purposes as I might or could do if personally present, and hereby ratifying and confirming all that my said attorney-in-fact shall lawfully do or cause to be done by virtue of these presents.</p>

<p>IN WITNESS WHEREOF, I have hereunto set my hand this {{executionDate}}, at {{executionPlace}}, Philippines.</p>

<p>____________________________<br/><b>{{borrowerName}}</b><br/>Principal</p>

<p>Accepted by:<br/><b>{{companyName}}</b><br/>Attorney-in-Fact<br/>By:</p>
<p>____________________________<br/>Authorized Representative</p>

<p>SIGNED IN THE PRESENCE OF:</p>
<table><tbody><tr>
<td>____________________________<br/>{{witnessOne}}</td>
<td>____________________________<br/>{{witnessTwo}}</td>
</tr></tbody></table>

<p><b>ACKNOWLEDGEMENT</b></p>
<p>REPUBLIC OF THE PHILIPPINES&nbsp;)<br/>CITY OF {{executionPlace}}&nbsp;) S.S.</p>
<p>BEFORE ME, a Notary Public for and in the City of {{executionPlace}}, this {{executionDate}}, personally appeared:</p>
<table><tbody>
<tr><th>Name</th><th>ID / Card Number</th><th>Validity</th></tr>
<tr><td>{{borrowerName}}</td><td>{{borrowerTin}}</td><td></td></tr>
<tr><td>{{companyName}}</td><td>TIN {{lenderTin}}</td><td></td></tr>
<tr><td>{{lenderRepresentative}}</td><td>TIN {{lenderRepresentativeTin}}</td><td></td></tr>
</tbody></table>
<p>known to me to be the same persons who executed the foregoing Special Power of Attorney, and they acknowledged to me that the same is their free and voluntary act and deed, and that of the corporation herein represented.</p>
<p>WITNESS MY HAND AND SEAL on the date and place first above written.</p>
<p>Doc. No. {{notaryDocNo}};<br/>Page No. {{notaryPageNo}};<br/>Book No. {{notaryBookNo}};<br/>Series of {{notarySeries}}.</p>
</div>
$docm$::text AS body
)
UPDATE public.document_template_versions v SET status = 'archived'
  FROM public.document_templates t, reviewed_body b
 WHERE v.template_id = t.id
   AND t.slug = 'spa_mortgage_cancellation'
   AND v.status = 'published'
   AND v.body IS DISTINCT FROM b.body;

WITH reviewed_body AS (
  SELECT $docm$
<div data-compact-nudge>
<h2 style="text-align:center">SPECIAL POWER OF ATTORNEY</h2>

<p><b>KNOW ALL MEN BY THESE PRESENTS:</b></p>

<p>I, <b>{{borrowerName}}</b>, of legal age, Filipino, and residing at {{address}}, do hereby name, constitute, and appoint:</p>

<p><b>{{companyName}}</b>, a corporation duly organized and existing under Philippine laws, with business address at {{lenderAddress}}, represented by its authorized officers and/or representatives, to be my true and lawful attorney-in-fact, for me and in my name, place, and stead, to perform and execute the following acts, deeds, and things:</p>

<p>1. To process, represent, facilitate, and secure the Cancellation of Chattel Mortgage over my motor vehicle with the Registry of Deeds (RD) and the Land Transportation Office (LTO), which vehicle is more particularly described as follows:</p>

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

<p>2. To sign, execute, submit, and receive any and all documents, applications, clearances, and certificates necessary for, or required by, the Registry of Deeds and the Land Transportation Office in connection with the cancellation of the said Chattel Mortgage and the updating of the vehicle's records;</p>
<p>3. To pay any and all required fees, assessments, and charges related to the cancellation of the mortgage; and</p>
<p>4. To perform all other acts necessary, convenient, or incidental to carry out the purposes stated above.</p>

<p>HEREBY GIVING AND GRANTING unto my said attorney-in-fact full power and authority to do and perform any and every act and thing whatsoever requisite, necessary, or proper to be done in and about the premises, as fully to all intents and purposes as I might or could do if personally present, and hereby ratifying and confirming all that my said attorney-in-fact shall lawfully do or cause to be done by virtue of these presents.</p>

<p>IN WITNESS WHEREOF, I have hereunto set my hand this {{executionDate}}, at {{executionPlace}}, Philippines.</p>

<p>____________________________<br/><b>{{borrowerName}}</b><br/>Principal</p>

<p>Accepted by:<br/><b>{{companyName}}</b><br/>Attorney-in-Fact<br/>By:</p>
<p>____________________________<br/>Authorized Representative</p>

<p>SIGNED IN THE PRESENCE OF:</p>
<table><tbody><tr>
<td>____________________________<br/>{{witnessOne}}</td>
<td>____________________________<br/>{{witnessTwo}}</td>
</tr></tbody></table>

<p><b>ACKNOWLEDGEMENT</b></p>
<p>REPUBLIC OF THE PHILIPPINES&nbsp;)<br/>CITY OF {{executionPlace}}&nbsp;) S.S.</p>
<p>BEFORE ME, a Notary Public for and in the City of {{executionPlace}}, this {{executionDate}}, personally appeared:</p>
<table><tbody>
<tr><th>Name</th><th>ID / Card Number</th><th>Validity</th></tr>
<tr><td>{{borrowerName}}</td><td>{{borrowerTin}}</td><td></td></tr>
<tr><td>{{companyName}}</td><td>TIN {{lenderTin}}</td><td></td></tr>
<tr><td>{{lenderRepresentative}}</td><td>TIN {{lenderRepresentativeTin}}</td><td></td></tr>
</tbody></table>
<p>known to me to be the same persons who executed the foregoing Special Power of Attorney, and they acknowledged to me that the same is their free and voluntary act and deed, and that of the corporation herein represented.</p>
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
 WHERE t.slug = 'spa_mortgage_cancellation'
   AND NOT EXISTS (
     SELECT 1 FROM public.document_template_versions v
      WHERE v.template_id = t.id AND v.body = b.body
   );
