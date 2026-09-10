-- LSLGC SME document templates — Batch 1: servicing / post-close instruments.
--
-- Seven NEW admin-editable templates (category = 'servicing'). Not wired into
-- the LRA release generator: they render against buildSampleContext() in the
-- admin preview and are pulled manually when a servicing situation needs one.
-- Eligibility: seafarer_generation = 'hidden', sme_generation = 'optional'.
--
-- Source: C:\Users\Rovick\Desktop\LSLGC Documents\LSLGC Calculator and Docs
-- Plan:   docs/revision-plans/lslgc-sme-document-templates-seed-plan.md (Batch 1)
--
-- Repeat/condition mechanics:
--   data-repeat="vehicles" | "properties" | "priorLoans" | "replacementChecks"
--   data-if / data-unless="isCorpOrDti"
-- Merge keys are defined in src/lib/documents/templates/fields.ts.
--
-- Literal borrower data from the sample .doc files has been stripped and
-- replaced with {{tokens}}; legal clause wording is kept verbatim. Clauses that
-- read as unfinished in the source are marked [VERIFY WORDING] for Legal.

-- ============================================================================
-- helper: upsert one template + its published version 1 (idempotent)
-- ============================================================================

-- 1. Cancellation of Chattel Mortgage -----------------------------------------
WITH t AS (
  INSERT INTO public.document_templates (slug, name, description, category,
                                         seafarer_generation, sme_generation)
  VALUES (
    'cancellation_of_chattel_mortgage',
    'Cancellation of Chattel Mortgage',
    'Release/cancellation of a registered chattel mortgage once the secured loan is fully paid. Supports one or more vehicles.',
    'servicing', 'hidden', 'optional'
  )
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name, description = EXCLUDED.description,
        category = EXCLUDED.category,
        seafarer_generation = EXCLUDED.seafarer_generation,
        sme_generation = EXCLUDED.sme_generation
  RETURNING id
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT id, 1, $body$
<h2 style="text-align:center">CANCELLATION OF CHATTEL MORTGAGE</h2>

<p><b>KNOW ALL MEN BY THESE PRESENTS:</b></p>

<p data-unless="isCorpOrDti">That WHEREAS, the MORTGAGOR(s), <b>{{borrowerName}}</b>, of legal age, residing at {{address}}, and by that certain chattel mortgage made and executed on:</p>
<p data-if="isCorpOrDti">That WHEREAS, the MORTGAGOR(s), <b>{{borrowerName}}</b>, a company duly organized under the laws of the Philippines, with primary office address at {{address}}, herein represented by {{borrowerRepresentative}}, known as its &ldquo;{{borrowerRepresentativeTitle}}&rdquo;, and by that certain chattel mortgage made and executed on:</p>

<table><tbody>
<tr><th>Amount (PHP)</th><th>Executed on</th><th>Doc. No.</th><th>Page No.</th><th>Book No.</th><th>Series of</th><th>Notarial Public</th><th>Notary place</th><th>Registry of Deeds</th></tr>
<tr><td>{{priorMortgageAmount}}</td><td>{{priorMortgageExecutedOn}}</td><td>{{priorMortgageDocNo}}</td><td>{{priorMortgagePageNo}}</td><td>{{priorMortgageBookNo}}</td><td>{{priorMortgageSeries}}</td><td>{{priorMortgageNotary}}</td><td>{{priorMortgageNotaryPlace}}</td><td>{{priorMortgageRegistryOfDeeds}}</td></tr>
</tbody></table>

<p>mortgaged to the <b>{{companyName}}</b>, a financing corporation duly organized and existing under and by virtue of the laws of the Philippines with principal office at {{lenderAddress}}, Philippines, as security for the payment of certain loans, credit lines and other credit accommodations in the sum of {{priorMortgageAmountInWords}} (PHP {{priorMortgageAmount}}), under the terms and conditions stipulated therein, the property(ies) described in the said chattel mortgage:</p>

<table><tbody>
<tr><th>Year Model / Make</th><th>Plate No.</th><th>Engine No.</th><th>CR No.</th><th>Chassis No.</th><th>MV File No.</th></tr>
<tr data-repeat="vehicles"><td>{{makeYearModel}}</td><td>{{plateNo}}</td><td>{{engineNo}}</td><td>{{crNo}}</td><td>{{chassisNo}}</td><td>{{mvFileNo}}</td></tr>
</tbody></table>

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
$body$, 'published', now()
FROM t
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_template_versions v
  WHERE v.template_id = t.id AND v.version_no = 1
);

-- 2. Cancellation of Real Estate Mortgage -----------------------------------------
WITH t AS (
  INSERT INTO public.document_templates (slug, name, description, category,
                                         seafarer_generation, sme_generation)
  VALUES (
    'cancellation_of_real_estate_mortgage',
    'Cancellation of Real Estate Mortgage',
    'Release/cancellation of a registered real estate mortgage once the secured loan is fully paid. Supports one or more titled properties.',
    'servicing', 'hidden', 'optional'
  )
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name, description = EXCLUDED.description,
        category = EXCLUDED.category,
        seafarer_generation = EXCLUDED.seafarer_generation,
        sme_generation = EXCLUDED.sme_generation
  RETURNING id
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT id, 1, $body$
<h2 style="text-align:center">CANCELLATION OF REAL ESTATE MORTGAGE</h2>

<p><b>KNOW ALL MEN BY THESE PRESENTS:</b></p>

<p>That WHEREAS, the MORTGAGOR(s), <b>{{borrowerName}}</b>, of legal age, residing at {{address}}, and by that certain real estate mortgage made and executed on:</p>

<table><tbody>
<tr><th>Amount (PHP)</th><th>Executed on</th><th>Doc. No.</th><th>Page No.</th><th>Book No.</th><th>Series of</th><th>Notarial Public</th><th>Notary place</th><th>Registry of Deeds</th></tr>
<tr><td>{{priorMortgageAmount}}</td><td>{{priorMortgageExecutedOn}}</td><td>{{priorMortgageDocNo}}</td><td>{{priorMortgagePageNo}}</td><td>{{priorMortgageBookNo}}</td><td>{{priorMortgageSeries}}</td><td>{{priorMortgageNotary}}</td><td>{{priorMortgageNotaryPlace}}</td><td>{{priorMortgageRegistryOfDeeds}}</td></tr>
</tbody></table>

<p>mortgaged to the <b>{{companyName}}</b>, a financing corporation duly organized and existing under and by virtue of the laws of the Philippines with principal office at {{lenderAddress}}, Philippines, as security for the payment of certain loans, credit lines and other credit accommodations in the sum of {{priorMortgageAmountInWords}} (PHP {{priorMortgageAmount}}), under the terms and conditions stipulated therein, the property(ies) described in the said real estate mortgage:</p>

<div data-repeat="properties">
<p>A parcel/s of land located at {{location}}, covered by Transfer Certificate of Title (TCT) Number/s {{tctNo}}, consisting of {{areaSqm}} square meters.</p>
<p><b>TECHNICAL DESCRIPTION/S OF MORTGAGED PROPERTY/IES:</b></p>
<p>{{technicalDescription}}</p>
</div>

<p>And, WHEREAS, the {{companyName}} has received the full consideration for the said real estate mortgage;</p>

<p>NOW, THEREFORE, the {{companyName}} does hereby release and cancel the said real estate mortgage.</p>

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
<p>who has/have satisfactorily proven to me their respective identities upon presentment of their respective Competent Evidence of Identity and known to me and to me known to be the same person who executed the foregoing instrument and acknowledged to me that the same is his/her free and voluntary act and deed and the free and voluntary act and deed of the corporation represented. The foregoing document refers to a Full Cancellation of Real Estate Mortgage.</p>
<p>IN WITNESS WHEREOF, I have hereunto signed and sealed these presents at the place and on the date first herein above written.</p>
<p>Doc. No. {{notaryDocNo}};<br/>Page No. {{notaryPageNo}};<br/>Book No. {{notaryBookNo}};<br/>Series of {{notarySeries}}.</p>
$body$, 'published', now()
FROM t
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_template_versions v
  WHERE v.template_id = t.id AND v.version_no = 1
);

-- 3. Voluntary Surrender + Deed of Absolute Sale (Vehicle) -------------------------
WITH t AS (
  INSERT INTO public.document_templates (slug, name, description, category,
                                         seafarer_generation, sme_generation)
  VALUES (
    'voluntary_surrender_deed_auto',
    'Voluntary Surrender + Deed of Absolute Sale (Vehicle)',
    'Annex C (Voluntary Surrender Form) + Annex D (Deed of Absolute Sale) for one or more mortgaged vehicles on default.',
    'servicing', 'hidden', 'optional'
  )
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name, description = EXCLUDED.description,
        category = EXCLUDED.category,
        seafarer_generation = EXCLUDED.seafarer_generation,
        sme_generation = EXCLUDED.sme_generation
  RETURNING id
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT id, 1, $body$
<p style="text-align:right"><b>ANNEX &ldquo;C&rdquo;</b></p>
<h2 style="text-align:center">VOLUNTARY SURRENDER FORM</h2>

<p>I, <b>{{borrowerName}}</b>, with principal address at {{address}}, hereby, voluntarily surrender the vehicle to <b>{{companyName}}</b>, as full/partial payment of my debt in the amount of {{surrenderDebtAmountInWords}} (Php {{surrenderDebtAmount}}); below are the details of my unit:</p>

<p><b>VEHICLE INFO:</b></p>
<table><tbody>
<tr><th>Make / Year Model</th><th>Engine No.</th><th>Chassis No.</th><th>Plate No.</th><th>CR No.</th><th>MV File No.</th><th>Registered Owner</th></tr>
<tr data-repeat="vehicles"><td>{{makeYearModel}}</td><td>{{engineNo}}</td><td>{{chassisNo}}</td><td>{{plateNo}}</td><td>{{crNo}}</td><td>{{mvFileNo}}</td><td>{{registeredOwner}}</td></tr>
</tbody></table>

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
<table><tbody>
<tr><th>Make / Year Model</th><th>Engine No.</th><th>Chassis No.</th><th>Plate No.</th><th>CR No.</th><th>MV File No.</th></tr>
<tr data-repeat="vehicles"><td>{{makeYearModel}}</td><td>{{engineNo}}</td><td>{{chassisNo}}</td><td>{{plateNo}}</td><td>{{crNo}}</td><td>{{mvFileNo}}</td></tr>
</tbody></table>
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
$body$, 'published', now()
FROM t
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_template_versions v
  WHERE v.template_id = t.id AND v.version_no = 1
);

-- 4. Voluntary Surrender + Deed of Absolute Sale (Real Property) ------------------
WITH t AS (
  INSERT INTO public.document_templates (slug, name, description, category,
                                         seafarer_generation, sme_generation)
  VALUES (
    'voluntary_surrender_deed_rem',
    'Voluntary Surrender + Deed of Absolute Sale (Real Property)',
    'Annex C (Voluntary Surrender Form) + Annex D (Deed of Absolute Sale) for one or more mortgaged titled properties on default.',
    'servicing', 'hidden', 'optional'
  )
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name, description = EXCLUDED.description,
        category = EXCLUDED.category,
        seafarer_generation = EXCLUDED.seafarer_generation,
        sme_generation = EXCLUDED.sme_generation
  RETURNING id
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT id, 1, $body$
<p style="text-align:right"><b>ANNEX &ldquo;C&rdquo;</b></p>
<h2 style="text-align:center">VOLUNTARY SURRENDER FORM</h2>

<p>I, <b>{{borrowerName}}</b>, with principal address at {{address}}, hereby, voluntarily surrender the property/ies to <b>{{companyName}}</b>, as full/partial payment of my debt in the amount of {{surrenderDebtAmountInWords}} (Php {{surrenderDebtAmount}}); below are the details of my property/ies:</p>

<div data-repeat="properties">
<p>A parcel/s of land located at {{location}}, covered by Transfer Certificate of Title (TCT) Number/s {{tctNo}}, consisting of {{areaSqm}} square meters.</p>
<p><b>TECHNICAL DESCRIPTION/S OF MORTGAGED PROPERTY/IES:</b></p>
<p>{{technicalDescription}}</p>
</div>

<p>As such both parties agreed to the following terms and condition to wit:</p>
<p>That both parties agreed on the value of the property/ies based on prevailing market rate from the time property/ies surrendered to {{companyName}} to be written at the above paragraph;</p>
<p>That this instrument will be executed after two (2) months default of payment;</p>
<p>That in consideration {{companyName}} will give a redemption period of {{redemptionPeriod}} to settle the above outstanding balance;</p>
<p>That I am giving full authority to the {{companyName}} to execute the Deed of Sale once I did not settle my obligation on a given redemption period;</p>
<p>That I waived all my rights as owner of the said property/ies after execution of deed of sale;</p>
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
<p>I, <b>{{borrowerName}}</b>, of legal age, with postal address at {{address}}, and the registered and lawful owner of a property/ies described as follows:</p>
<div data-repeat="properties">
<p>A parcel/s of land located at {{location}}, covered by Transfer Certificate of Title (TCT) Number/s {{tctNo}}, consisting of {{areaSqm}} square meters.</p>
<p><b>TECHNICAL DESCRIPTION/S OF MORTGAGED PROPERTY/IES:</b></p>
<p>{{technicalDescription}}</p>
</div>
<p>That for and in consideration of the total sum of {{surrenderDebtAmountInWords}} (P {{surrenderDebtAmount}}), paid in full by {{companyName}}, with address at {{lenderAddress}}, receipt of which is hereby acknowledged by me to my full satisfaction, I hereby by these presents, sell, cede, convey and otherwise dispose of the above-described property unto VENDEE, its heirs, successors and assigns, free from all liens and encumbrances. Further, said sale is on an &ldquo;as is, where is&rdquo; basis.</p>
<p>That the VENDOR hereby warrants his title over the land above-described, with full right to dispose of the same, free from all liens and encumbrances, and that henceforth, full right of ownership and possession of the whole property shall pertain to the buyers.</p>
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
$body$, 'published', now()
FROM t
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_template_versions v
  WHERE v.template_id = t.id AND v.version_no = 1
);

-- 5. Special Power of Attorney (Mortgage Cancellation) ---------------------------
WITH t AS (
  INSERT INTO public.document_templates (slug, name, description, category,
                                         seafarer_generation, sme_generation)
  VALUES (
    'spa_mortgage_cancellation',
    'Special Power of Attorney (Mortgage Cancellation)',
    'Borrower authorises LSLGC as attorney-in-fact to process the RD / LTO cancellation of a chattel mortgage over one or more vehicles.',
    'servicing', 'hidden', 'optional'
  )
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name, description = EXCLUDED.description,
        category = EXCLUDED.category,
        seafarer_generation = EXCLUDED.seafarer_generation,
        sme_generation = EXCLUDED.sme_generation
  RETURNING id
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT id, 1, $body$
<h2 style="text-align:center">SPECIAL POWER OF ATTORNEY</h2>

<p><b>KNOW ALL MEN BY THESE PRESENTS:</b></p>

<p>I, <b>{{borrowerName}}</b>, of legal age, Filipino, and residing at {{address}}, do hereby name, constitute, and appoint:</p>

<p><b>{{companyName}}</b>, a corporation duly organized and existing under Philippine laws, with business address at {{lenderAddress}}, represented by its authorized officers and/or representatives, to be my true and lawful attorney-in-fact, for me and in my name, place, and stead, to perform and execute the following acts, deeds, and things:</p>

<p>1. To process, represent, facilitate, and secure the Cancellation of Chattel Mortgage over my motor vehicle with the Registry of Deeds (RD) and the Land Transportation Office (LTO), which vehicle is more particularly described as follows:</p>

<table><tbody>
<tr><th>Make / Series / Year Model</th><th>MV File No.</th><th>Transmission</th><th>Engine No.</th><th>Chassis No.</th><th>Plate No.</th></tr>
<tr data-repeat="vehicles"><td>{{makeYearModel}}</td><td>{{mvFileNo}}</td><td>{{transmission}}</td><td>{{engineNo}}</td><td>{{chassisNo}}</td><td>{{plateNo}}</td></tr>
</tbody></table>

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
$body$, 'published', now()
FROM t
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_template_versions v
  WHERE v.template_id = t.id AND v.version_no = 1
);

-- 6. Agreement for Replacement of Checks ---------------------------------------
WITH t AS (
  INSERT INTO public.document_templates (slug, name, description, category,
                                         seafarer_generation, sme_generation)
  VALUES (
    'agreement_check_replacement',
    'Agreement for Replacement of Checks',
    'Borrower replaces the outstanding post-dated checks on a chattel mortgage loan; impounding and cash-deposit terms while replacement is pending.',
    'servicing', 'hidden', 'optional'
  )
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name, description = EXCLUDED.description,
        category = EXCLUDED.category,
        seafarer_generation = EXCLUDED.seafarer_generation,
        sme_generation = EXCLUDED.sme_generation
  RETURNING id
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT id, 1, $body$
<h2 style="text-align:center">AGREEMENT FOR REPLACEMENT OF CHECKS</h2>

<p>entered into between:</p>
<p><b>{{companyName}}</b>, a corporation duly organized by Philippine law, with postal address at {{lenderAddress}}, represented by {{lenderRepresentative}}, hereinafter referred to as the &ldquo;LENDER&rdquo;.</p>
<p>and</p>
<p><b>{{borrowerName}}</b>, of legal age and residing at {{address}}, hereinafter referred to as the &ldquo;BORROWER&rdquo;.</p>

<p>The BORROWER requested the LENDER that he will replace the old post-dated checks for his term of payments for his chattel mortgage loan released on {{chattelReleaseDate}} with a total obligation of {{totalObligationInWords}} (Php {{totalObligation}}). Based on the given schedule of payment, the monthly amortization will start on {{amortStartDate}} and will mature on {{amortMaturityDate}}.</p>
<p>After the BORROWER's request, the LENDER agreed to accept the replacement of the old post-dated checks under the following terms and conditions which both PARTIES agreed upon such as:</p>

<p>1. The LENDER allows the BORROWER based on his request to replace the old Post-Dated checks on {{checkReplacementDate}}. Details of the checks are as follows:</p>
<table><tbody>
<tr><th>Bank / Branch</th><th>Check Number</th><th>Date</th><th>Amount</th></tr>
<tr data-repeat="replacementChecks"><td>{{bankBranch}}</td><td>{{checkNumber}}</td><td>{{checkDate}}</td><td>{{amount}}</td></tr>
</tbody></table>

<p>2. That in the event the BORROWER failed to replace the old post-dated check stated above, the LENDER will pull out the mortgage vehicle until such time the post-dated checks are replaced;</p>
<p>3. That during the impounding of the vehicle, the BORROWER shall settle his monthly amortization through cash payment to be deposited at the LENDER's bank account. Bank details are as follows:</p>
<table><tbody>
<tr><td>Bank</td><td>{{lenderDepositBank}}</td></tr>
<tr><td>Account Name</td><td>{{lenderDepositAccountName}}</td></tr>
<tr><td>Account Number</td><td>{{lenderDepositAccountNo}}</td></tr>
</tbody></table>
<p><i>Note: The copy of the deposit slip should be forwarded to Collection Department as proof of payment and for verification.</i></p>
<p>4. In the event of non-payment, the provisions of penalties and other charges stipulated in the Loan Agreement will be imposed.</p>
<p>5. That the BORROWER agreed to pay the parking space fee that will incur during the impounding period of the mortgage vehicle.</p>

<p>The PARTIES agreed that all terms and condition stipulated above is to his knowledge.</p>
<p>IN WITNESS WHEREOF, the parties have hereunto set their hands this {{executionDate}} at {{executionPlace}}.</p>

<table><tbody><tr>
<td><b>{{companyName}}</b><br/>By:<br/>____________________________<br/>{{lenderRepresentative}}<br/>Lender</td>
<td>____________________________<br/><b>{{borrowerName}}</b><br/>Borrower</td>
</tr></tbody></table>

<p>Signed in the presence of:</p>
<table><tbody><tr>
<td>____________________________<br/>{{witnessOne}}</td>
<td>____________________________<br/>{{witnessTwo}}</td>
</tr></tbody></table>

<p><b>ACKNOWLEDGEMENT</b></p>
<p>REPUBLIC OF THE PHILIPPINES&nbsp;)<br/>____________________________&nbsp;) S.S.</p>
<p>BEFORE ME, a Notary Public for and in the city of {{executionPlace}} on this {{executionDate}} personally appeared:</p>
<table><tbody>
<tr><th>Name</th><th>Valid Government ID</th></tr>
<tr><td>{{companyName}}</td><td>{{lenderTin}}</td></tr>
<tr><td>{{lenderRepresentative}}</td><td>{{lenderRepresentativeTin}}</td></tr>
</tbody></table>
<p>Known to me and to me known to be the same persons who executed the foregoing Agreement for Replacement of Checks, consisting of pages including this page whereon this acknowledgment is written and signed by the parties on each page of this instrument.</p>
<p>WITNESS MY HAND AND SEAL on the date and place first above written.</p>
<p>Doc. No. {{notaryDocNo}};<br/>Page No. {{notaryPageNo}};<br/>Book No. {{notaryBookNo}};<br/>Series of {{notarySeries}}.</p>
$body$, 'published', now()
FROM t
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_template_versions v
  WHERE v.template_id = t.id AND v.version_no = 1
);

-- 7. Agreement for Consolidation of Loan Releases -----------------------------
WITH t AS (
  INSERT INTO public.document_templates (slug, name, description, category,
                                         seafarer_generation, sme_generation)
  VALUES (
    'agreement_for_consolidation',
    'Agreement for Consolidation of Loan Releases Under Multiple Loans',
    'Consolidates an additional loan with the borrower''s existing outstanding loans under one combined obligation and schedule.',
    'servicing', 'hidden', 'optional'
  )
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name, description = EXCLUDED.description,
        category = EXCLUDED.category,
        seafarer_generation = EXCLUDED.seafarer_generation,
        sme_generation = EXCLUDED.sme_generation
  RETURNING id
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT id, 1, $body$
<h2 style="text-align:center">AGREEMENT FOR CONSOLIDATION OF LOAN RELEASES UNDER MULTIPLE LOANS</h2>

<p>entered into between:</p>
<p><b>{{companyName}}</b>, a corporation duly organized by Philippine law, with office address at {{lenderAddress}}, represented by {{lenderRepresentative}}, known as the &ldquo;Lender&rdquo;</p>
<p>and</p>
<p><b>{{borrowerName}}</b>, a corporation duly incorporated under the laws of the Philippines, with primary office address at {{address}}, herein represented by {{borrowerRepresentative}}, known as its &ldquo;{{borrowerRepresentativeTitle}}&rdquo;, authorized to transact, and execute and sign all documents in behalf of the Corporation by virtue of Board Resolution No. {{boardResolutionNo}} executed by Corporate Secretary, {{corporateSecretary}}, hereinafter referred to as the &ldquo;Borrower&rdquo;.</p>

<p>The parties have agreed to the following terms and conditions:</p>

<p>1. The Borrower requested and was approved to have an additional loan in the amount of {{additionalLoanAmountInWords}} (Php {{additionalLoanAmount}}) payable for a period of {{additionalLoanTermMonths}} months and with a monthly interest rate of {{additionalLoanInterestRate}}. The total loan amount including the interest is amounting to {{additionalLoanTotalInWords}} (Php {{additionalLoanTotal}});</p>

<p>2. The Borrower acknowledges the loan obligations for the following loans:</p>
<table><tbody>
<tr><th>Loan Number</th><th>Total loan amount incl. interest</th><th>Released on</th></tr>
<tr data-repeat="priorLoans"><td>{{loanNo}}</td><td>{{totalAmountInWords}} (PHP {{totalAmount}})</td><td>{{releasedOn}}</td></tr>
</tbody></table>
<p>The total loan amount for all {{priorLoansCount}} loans is amounting to {{allLoansTotalInWords}} (PHP {{allLoansTotal}});</p>

<p>3. The loan payment of the Borrower shall be paid according to the amortization schedule of all loan agreements whichever due date comes first;</p>
<p>4. The Borrower shall be in default if it fails to promptly settle or to pay any obligation it may have with the Lender in any agreements.</p>
<p>5. If the Borrower is in default in any of the loan agreements, whatever payments made will be divided into all the obligations of the Borrower based on the percentage of the value of the loan;</p>
<p>6. In the event that any of the collateral loans defaulted, the Lender will enforce the Voluntary Surrender terms and conditions of the loan agreement. The Lender will seize the pledged collaterals and will execute the Deed of Absolute Sale;</p>

<p>This agreement for consolidation of loan releases under multiple loans has been executed by the parties with full understanding and knowledge.</p>
<p>IN WITNESS WHEREOF, the parties hereto have signed this instrument this {{executionDate}} at {{executionPlace}}.</p>

<table><tbody><tr>
<td><b>{{companyName}}</b><br/>Represented by:<br/>____________________________<br/>{{lenderRepresentative}}</td>
<td><b>{{borrowerName}}</b><br/>Represented by:<br/>____________________________<br/>{{borrowerRepresentative}}</td>
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
<tr><td>{{lenderRepresentative}}</td><td>TIN {{lenderRepresentativeTin}}</td><td></td></tr>
<tr><td>{{borrowerName}}</td><td>TIN {{borrowerTin}}</td><td></td></tr>
<tr><td>{{borrowerRepresentative}}</td><td></td><td></td></tr>
</tbody></table>
<p>Known to me and to me known to be the same persons who executed the Agreement for Consolidation of Loan Releases Under Multiple Loans, consisting of two (2) pages including this page whereon this acknowledgement is written and signed by the parties on each page of this instrument.</p>
<p>WITNESS MY HAND AND SEAL on the date and place first above written.</p>
<p>Doc. No. {{notaryDocNo}};<br/>Page No. {{notaryPageNo}};<br/>Book No. {{notaryBookNo}};<br/>Series of {{notarySeries}}.</p>
$body$, 'published', now()
FROM t
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_template_versions v
  WHERE v.template_id = t.id AND v.version_no = 1
);
