/**
 * `spa_mortgage_cancellation` — vehicle-block geometry fix.
 *
 * Confirmed against the real source
 * `SPECIAL POWER OF ATTORNEY Cancellation of Mortgage.docx` /
 * `... (1).docx` (LSLGC Calculator and Docs, extracted with python-docx —
 * both are the same filled sample, one with the principal's passport number
 * filled into the acknowledgment ID table and one without; the prose is
 * otherwise identical). The vehicle description is NOT one wide table with a
 * 6-label header row and one cloned row per vehicle (what the published body
 * had, along with an invented `{{transmission}}` token that has no source
 * anywhere in `buildReleaseTemplateContext`'s output). It is a stacked
 * label/value list — the same shape as the chattel-mortgage family's
 * already-fixed per-vehicle table (Phase 4).
 *
 * Fixed by replacing the wide table with the established
 * `<div data-repeat="vehicles">` block wrapping a 7-row key/value table,
 * using the same field set/order/labels as deed_of_chattel_mortgage
 * (makeYearModel, engineNo, chassisNo, plateNo, crNo, mvFileNo,
 * registeredOwner — see collateral-context.ts's `DocumentVehicleRow`, which
 * explicitly lists spa_mortgage_cancellation among the documents this
 * collateral row shape feeds). The source's own "Transmission" line has no
 * captured field anywhere in the system, so it is dropped rather than
 * invented — same rule applied throughout every prior phase.
 *
 * Everything else in the published body (principal/attorney-in-fact
 * recitals, powers granted, acknowledgment) was spot-checked against the
 * same source and already matches — untouched here.
 */
export const SOURCE_FAITHFUL_SPA_MORTGAGE_CANCELLATION_PREVIEW = String.raw`
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
</div>`;
