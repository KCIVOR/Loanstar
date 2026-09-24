/**
 * `cancellation_of_chattel_mortgage` — vehicle-block geometry fix.
 *
 * Confirmed against the source `.doc` files (`CANCELLATION OF CHATTEL -
 * 1/2/3/4 unit(s).doc` and the `... Corp and DTI- 1/2/3/4 unit(s).doc`
 * borrower-form variants, extracted with antiword): same bug as
 * `deed_of_chattel_mortgage` — the published body rendered vehicles as one
 * wide table (6-label header row: Year Model / Make, Plate No., Engine No.,
 * CR No., Chassis No., MV File No. — no Registered Owner column, matching
 * this document's own source, which omits that field) with one cloned data
 * row per vehicle, instead of the source's own stacked per-vehicle 6-row x
 * 2-column key/value tables (confirmed directly in "- 2 units.doc", which
 * shows two independent 6-row tables back-to-back).
 *
 * Fixed the same way as the sibling template: `<div data-repeat="vehicles">`
 * wrapping a per-vehicle key/value table, field order and labels unchanged
 * (they already matched the source; only the geometry was wrong).
 *
 * The `isCorpOrDti` conditional recipient paragraph (individual vs.
 * Corp/DTI borrower form) was spot-checked against both source variants and
 * already matches — untouched here, and still renders correctly around the
 * fixed vehicle block (the conditional and the repeat are independent
 * elements, not nested).
 */
export const SOURCE_FAITHFUL_CANCELLATION_OF_CHATTEL_MORTGAGE_PREVIEW = String.raw`
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
</div>`;
