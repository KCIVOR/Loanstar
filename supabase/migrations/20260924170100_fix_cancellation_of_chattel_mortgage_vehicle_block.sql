-- Fix cancellation_of_chattel_mortgage's vehicle detail block: same bug as
-- the sibling deed_of_chattel_mortgage fix in this phase -- the published
-- body rendered mortgaged vehicles as ONE wide table (6-label header row:
-- Year Model / Make, Plate No., Engine No., CR No., Chassis No., MV File
-- No. -- no Registered Owner column, matching this document's own source,
-- which omits that field) with `<tr data-repeat="vehicles">` cloning one
-- data row per vehicle.
--
-- Checked against the real source `.doc` files (`CANCELLATION OF CHATTEL -
-- 1/2/3/4 unit(s).doc` and the `... Corp and DTI- 1/2/3/4 unit(s).doc`
-- borrower-form variants, LSLGC Calculator and Docs/Cancellation of
-- Mortgage), extracted with antiword: "- 2 units.doc" shows two
-- independent 6-row key/value tables stacked back-to-back, same pattern as
-- the sibling chattel-mortgage document.
--
-- Fixed the same way: `<div data-repeat="vehicles">` wrapping a per-vehicle
-- key/value table, field order/labels unchanged (already matched the
-- source). Rendered through the real Gotenberg pipeline with 1 and 2 sample
-- vehicles and visually compared against the source's own layout -- matches
-- exactly.
--
-- The `isCorpOrDti` conditional recipient paragraph (individual vs.
-- Corp/DTI borrower form) was spot-checked against both source variants and
-- already matched -- untouched here, and still renders correctly around
-- the fixed vehicle block (the conditional and the repeat are independent
-- sibling elements, not nested, so fixing one does not disturb the other).
--
-- See tiptap-roundtrip.test.mts: cancellation_of_chattel_mortgage_source_faithful.
-- Idempotent: archives the current published body only if different, then
-- inserts the reviewed body as a new published version only if not already
-- present verbatim. Never applied automatically -- see AGENTS.md
-- instructions for this document-fidelity phase.

WITH reviewed_body AS (
  SELECT $cocm$
<div data-compact-nudge>
<h2 style="text-align:center">CANCELLATION OF CHATTEL MORTGAGE</h2>

<p><b>KNOW ALL MEN BY THESE PRESENTS:</b></p>

<p data-unless="isCorpOrDti">That WHEREAS, the MORTGAGOR(s), <b>{{borrowerName}}</b>, of legal age, residing at {{address}}, and by that certain chattel mortgage made and executed on:</p>
<p data-if="isCorpOrDti">That WHEREAS, the MORTGAGOR(s), <b>{{borrowerName}}</b>, a company duly organized under the laws of the Philippines, with primary office address at {{address}}, herein represented by {{borrowerRepresentative}}, known as its &ldquo;{{borrowerRepresentativeTitle}}&rdquo;, and by that certain chattel mortgage made and executed on:</p>

<table><tbody>
<tr><th>Amount (PHP)</th><th>Executed on</th><th>Doc. No.</th><th>Page No.</th><th>Book No.</th><th>Series of</th><th>Notarial Public</th><th>Notary place</th><th>Registry of Deeds</th></tr>
<tr><td>{{priorMortgageAmount}}</td><td>{{priorMortgageExecutedOn}}</td><td>{{priorMortgageDocNo}}</td><td>{{priorMortgagePageNo}}</td><td>{{priorMortgageBookNo}}</td><td>{{priorMortgageSeries}}</td><td>{{priorMortgageNotary}}</td><td>{{priorMortgageNotaryPlace}}</td><td>{{priorMortgageRegistryOfDeeds}}</td></tr>
</tbody></table>

<p>mortgaged to the <b>{{companyName}}</b>, a financing corporation duly organized and existing under and by virtue of the laws of the Philippines with principal office at {{lenderAddress}}, Philippines, as security for the payment of certain loans, credit lines and other credit accommodations in the sum of {{priorMortgageAmountInWords}} (PHP {{priorMortgageAmount}}), under the terms and conditions stipulated therein, the property(ies) described in the said chattel mortgage:</p>

<div data-repeat="vehicles">
<table><tbody>
<tr><th>Year Model / Make</th><td>{{makeYearModel}}</td></tr>
<tr><th>Plate No.</th><td>{{plateNo}}</td></tr>
<tr><th>Engine No.</th><td>{{engineNo}}</td></tr>
<tr><th>CR No.</th><td>{{crNo}}</td></tr>
<tr><th>Chassis No.</th><td>{{chassisNo}}</td></tr>
<tr><th>MV File No.</th><td>{{mvFileNo}}</td></tr>
</tbody></table>
</div>

<p>And, WHEREAS, the {{companyName}} has received the full consideration for the said chattel mortgage;</p>

<p>NOW, THEREFORE, the {{companyName}} does hereby release and cancel the said chattel mortgage.</p>

<p>IN WITNESS WHEREOF, the {{companyName}}, duly represented herein by its authorized officer(s), has hereunto set its hand at {{executionPlace}}, Philippines, on {{executionDate}}.</p>

<p><b>{{companyName}}</b><br/>TIN: {{lenderTin}}<br/>By:</p>
<p>&nbsp;</p>
<p>____________________________<br/><b>{{authorizedSignatory}}</b><br/>Authorized Signatory</p>

<p>SIGNED IN THE PRESENCE OF:</p>
<table><tbody><tr>
<td>____________________________<br/>{{witnessOne}}</td>
<td>____________________________<br/>{{witnessTwo}}</td>
</tr></tbody></table>

<p><b>ACKNOWLEDGMENT</b></p>
<p>REPUBLIC OF THE PHILIPPINES&nbsp;)<br/>_______________________________&nbsp;) S.S.</p>
<p>BEFORE ME, in the City of {{executionPlace}} on {{executionDate}} personally appeared:</p>
<table><tbody>
<tr><th>Name</th><th>ID / Card Number</th><th>Validity</th></tr>
<tr><td>{{companyName}}</td><td>TIN {{lenderTin}}</td><td></td></tr>
<tr><td>{{authorizedSignatory}}</td><td>TIN</td><td></td></tr>
</tbody></table>
<p>who has/have satisfactorily proven to me their respective identities upon presentment of their respective Competent Evidence of Identity and known to me and to me known to be the same person who executed the foregoing instrument and acknowledged to me that the same is his/her free and voluntary act and deed and the free and voluntary act and deed of the corporation represented. The foregoing document consisting of {{cancellationPageCount}} page refers to a Full Cancellation of Chattel Mortgage.</p>
<p>IN WITNESS WHEREOF, I have hereunto signed and sealed these presents at the place and on the date first herein above written.</p>
<p>Doc. No. {{notaryDocNo}};<br/>Page No. {{notaryPageNo}};<br/>Book No. {{notaryBookNo}};<br/>Series of {{notarySeries}}.</p>
</div>
$cocm$::text AS body
)
UPDATE public.document_template_versions v SET status = 'archived'
  FROM public.document_templates t, reviewed_body b
 WHERE v.template_id = t.id
   AND t.slug = 'cancellation_of_chattel_mortgage'
   AND v.status = 'published'
   AND v.body IS DISTINCT FROM b.body;

WITH reviewed_body AS (
  SELECT $cocm$
<div data-compact-nudge>
<h2 style="text-align:center">CANCELLATION OF CHATTEL MORTGAGE</h2>

<p><b>KNOW ALL MEN BY THESE PRESENTS:</b></p>

<p data-unless="isCorpOrDti">That WHEREAS, the MORTGAGOR(s), <b>{{borrowerName}}</b>, of legal age, residing at {{address}}, and by that certain chattel mortgage made and executed on:</p>
<p data-if="isCorpOrDti">That WHEREAS, the MORTGAGOR(s), <b>{{borrowerName}}</b>, a company duly organized under the laws of the Philippines, with primary office address at {{address}}, herein represented by {{borrowerRepresentative}}, known as its &ldquo;{{borrowerRepresentativeTitle}}&rdquo;, and by that certain chattel mortgage made and executed on:</p>

<table><tbody>
<tr><th>Amount (PHP)</th><th>Executed on</th><th>Doc. No.</th><th>Page No.</th><th>Book No.</th><th>Series of</th><th>Notarial Public</th><th>Notary place</th><th>Registry of Deeds</th></tr>
<tr><td>{{priorMortgageAmount}}</td><td>{{priorMortgageExecutedOn}}</td><td>{{priorMortgageDocNo}}</td><td>{{priorMortgagePageNo}}</td><td>{{priorMortgageBookNo}}</td><td>{{priorMortgageSeries}}</td><td>{{priorMortgageNotary}}</td><td>{{priorMortgageNotaryPlace}}</td><td>{{priorMortgageRegistryOfDeeds}}</td></tr>
</tbody></table>

<p>mortgaged to the <b>{{companyName}}</b>, a financing corporation duly organized and existing under and by virtue of the laws of the Philippines with principal office at {{lenderAddress}}, Philippines, as security for the payment of certain loans, credit lines and other credit accommodations in the sum of {{priorMortgageAmountInWords}} (PHP {{priorMortgageAmount}}), under the terms and conditions stipulated therein, the property(ies) described in the said chattel mortgage:</p>

<div data-repeat="vehicles">
<table><tbody>
<tr><th>Year Model / Make</th><td>{{makeYearModel}}</td></tr>
<tr><th>Plate No.</th><td>{{plateNo}}</td></tr>
<tr><th>Engine No.</th><td>{{engineNo}}</td></tr>
<tr><th>CR No.</th><td>{{crNo}}</td></tr>
<tr><th>Chassis No.</th><td>{{chassisNo}}</td></tr>
<tr><th>MV File No.</th><td>{{mvFileNo}}</td></tr>
</tbody></table>
</div>

<p>And, WHEREAS, the {{companyName}} has received the full consideration for the said chattel mortgage;</p>

<p>NOW, THEREFORE, the {{companyName}} does hereby release and cancel the said chattel mortgage.</p>

<p>IN WITNESS WHEREOF, the {{companyName}}, duly represented herein by its authorized officer(s), has hereunto set its hand at {{executionPlace}}, Philippines, on {{executionDate}}.</p>

<p><b>{{companyName}}</b><br/>TIN: {{lenderTin}}<br/>By:</p>
<p>&nbsp;</p>
<p>____________________________<br/><b>{{authorizedSignatory}}</b><br/>Authorized Signatory</p>

<p>SIGNED IN THE PRESENCE OF:</p>
<table><tbody><tr>
<td>____________________________<br/>{{witnessOne}}</td>
<td>____________________________<br/>{{witnessTwo}}</td>
</tr></tbody></table>

<p><b>ACKNOWLEDGMENT</b></p>
<p>REPUBLIC OF THE PHILIPPINES&nbsp;)<br/>_______________________________&nbsp;) S.S.</p>
<p>BEFORE ME, in the City of {{executionPlace}} on {{executionDate}} personally appeared:</p>
<table><tbody>
<tr><th>Name</th><th>ID / Card Number</th><th>Validity</th></tr>
<tr><td>{{companyName}}</td><td>TIN {{lenderTin}}</td><td></td></tr>
<tr><td>{{authorizedSignatory}}</td><td>TIN</td><td></td></tr>
</tbody></table>
<p>who has/have satisfactorily proven to me their respective identities upon presentment of their respective Competent Evidence of Identity and known to me and to me known to be the same person who executed the foregoing instrument and acknowledged to me that the same is his/her free and voluntary act and deed and the free and voluntary act and deed of the corporation represented. The foregoing document consisting of {{cancellationPageCount}} page refers to a Full Cancellation of Chattel Mortgage.</p>
<p>IN WITNESS WHEREOF, I have hereunto signed and sealed these presents at the place and on the date first herein above written.</p>
<p>Doc. No. {{notaryDocNo}};<br/>Page No. {{notaryPageNo}};<br/>Book No. {{notaryBookNo}};<br/>Series of {{notarySeries}}.</p>
</div>
$cocm$::text AS body
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT t.id,
       COALESCE((SELECT MAX(version_no) FROM public.document_template_versions WHERE template_id = t.id), 0) + 1,
       b.body,
       'published',
       now()
  FROM public.document_templates t
 CROSS JOIN reviewed_body b
 WHERE t.slug = 'cancellation_of_chattel_mortgage'
   AND NOT EXISTS (
     SELECT 1 FROM public.document_template_versions v
      WHERE v.template_id = t.id AND v.body = b.body
   );
