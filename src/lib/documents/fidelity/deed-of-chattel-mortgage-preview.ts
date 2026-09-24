/**
 * `deed_of_chattel_mortgage` — vehicle-block geometry fix.
 *
 * Confirmed against the source `.doc` files (`CHATTEL MORTGAGE - 1 unit.doc`
 * through `- 4 units.doc`, extracted with antiword): the vehicle detail is
 * NOT one wide table with a 7-label header row and one cloned row per
 * vehicle (what the published body had). Each vehicle gets its own small
 * 7-row x 2-column key/value table (label | value, one row per field:
 * Make / Year Model, Engine No., Chassis No., Plate No., CR No., MV File
 * No., Registered Owner) — confirmed directly in the "2 units" source,
 * which shows two independent 7-row tables stacked back-to-back, not one
 * wide table with 2 data rows.
 *
 * Fixed by wrapping the per-vehicle table in `<div data-repeat="vehicles">`
 * (the established `repeat_block` pattern — see tiptap-roundtrip.fixtures.ts
 * — the block-repeat equivalent of the property-collateral family's already-
 * correct `data-repeat="properties"` blocks) instead of the old
 * `<tr data-repeat="vehicles">` repeated-row pattern.
 *
 * Everything else in the published body (mortgagor/mortgagee recitals,
 * affidavit of good faith, acknowledgment) was spot-checked against the same
 * sources and already matches — untouched here.
 */
export const SOURCE_FAITHFUL_DEED_OF_CHATTEL_MORTGAGE_PREVIEW = String.raw`
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
</div>`;
