/**
 * SFCalculator/DL2 - No address.doc, transcribed into the schema-safe HTML
 * the Admin template editor actually supports (see disclosure-preview.ts's
 * header comment for the full rationale). Built only from primitives
 * already declared in extensions.ts: `data-accurate`, `table data-plain`,
 * `data-repeat`, `data-align`, native `<b>`/`<u>`.
 *
 * Despite the `demand_letter_second_notice` slug name, the DL2 source is a
 * dishonored/bounced-check demand letter, not a generic past-due notice
 * (that's the separate `demand_letter` slug, already wired to
 * src/lib/documents/generators/demand-letter.ts). This body matches the
 * DL2.doc wording verbatim. The "No address" filename variant matches the
 * source page itself, which opens straight on the borrower's name with no
 * address block.
 *
 * `bouncedChecks` (bankName/checkNumber/checkDate/amount rows) has no
 * generator wired to it yet — the AR bounced-check recording feature this
 * letter belongs to (see docs/ar-bounced-check-recording-implementation-plan.md)
 * is separate, in-progress work outside this document-fidelity phase.
 * Empty `bouncedChecks` renders the table header-only, same convention as
 * `priorLoans`/`invoices`/`vehicles` in template-context.ts.
 */
export const SOURCE_FAITHFUL_DEMAND_LETTER_SECOND_NOTICE_PREVIEW = String.raw`
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
</div>`;
