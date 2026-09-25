/**
 * LSLGC Calculator and Docs/Demand Letter - SME.doc, transcribed into the
 * schema-safe HTML the Admin template editor actually supports (see
 * disclosure-preview.ts's header comment for why: `data-plain`/`data-underline`/
 * `data-if`/`data-repeat` survive the TipTap round-trip, a `<style>` block or
 * CSS Grid does not).
 *
 * Real source content (a filled sample: "Producers Connection Logistics
 * Inc.", account no. 163-6-000089-55), parameterized with the SAME merge
 * field names the already-published `demand_letter_dishonored_check`
 * template uses (borrowerName, address, borrowerRepresentative,
 * demandCheckAccountNo, demandChecks[], demandReason) — no new fields
 * invented, confirmed against buildSampleContext's existing sample data
 * (demandCheckAccountNo's own sample is literally "163-6-000089-55", the
 * same account number this real source uses).
 *
 * Two real differences from that already-published template, kept as-is
 * rather than silently matched to it (design doc: record inconsistencies,
 * don't reinterpret content):
 *   - Greeting is "Dear Sir/Madame," in the source, not "Dear
 *     {{borrowerName}}," (the other template personalizes it).
 *   - Signature block is a single sequential column (Very truly yours, /
 *     gap / Received by: / signature line) in the source, not the other
 *     template's two-column "Very truly yours (company) | Received by
 *     (borrower)" layout.
 *   - The source's own text has a minor grammar gap ("within 5 days the
 *     receipt hereof", missing "of") — reproduced verbatim, not corrected.
 */
export const SOURCE_FAITHFUL_DEMAND_LETTER_SME_PREVIEW = String.raw`
<div data-document-footer="none">
<p>{{borrowerName}}<br/>{{address}}</p>

<p data-if="borrowerRepresentative"><b>Attention:</b> {{borrowerRepresentative}}<br/>{{borrowerRepresentativeTitle}}</p>

<p><b>Re: Dishonored check/s</b></p>

<p>Dear Sir/Madame,</p>

<p>For value received, you issued and delivered to {{companyName}} the following checks drawn against your account no. {{demandCheckAccountNo}}. Said Check has the following details</p>

<table><tbody>
<tr><th>Bank</th><th>Check Number</th><th>Date</th><th>Amount</th></tr>
<tr data-repeat="demandChecks"><td>{{bankName}}</td><td>{{checkNumber}}</td><td>{{checkDate}}</td><td>{{amount}}</td></tr>
</tbody></table>

<p>However, when the aforesaid checks were presented for payment when due, the same were dishonored and returned by the drawee bank for the reason: {{demandReason}}</p>

<p>In view thereof, final demand is hereby made upon you to redeem in cash the full value of the aforesaid checks including the penalties and interest thereon within 5 days the receipt hereof. Should you fail to do so, the company shall be constrained to institute the appropriate legal action against you.</p>

<p>Kindly give this matter your urgent attention.</p>

<p>Very truly yours,</p>

<p>Received by:</p>

<p>____________________________<br/><i>Signature Over Printed Name</i></p>
</div>`;
