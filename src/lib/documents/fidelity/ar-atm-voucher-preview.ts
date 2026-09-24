/**
 * SFCalculator/AR ATM.doc and AR ATM - With Spouse.doc, transcribed into the
 * schema-safe HTML the Admin template editor actually supports (see
 * disclosure-preview.ts's header comment for the full rationale). Built
 * only from primitives already declared in extensions.ts: `data-accurate`,
 * `table data-plain`, `data-underline`, `data-align`, `data-if`, native
 * `<b>`/`<u>`/`<i>`, and `<img class="doc-logo">` as its own block-level
 * element.
 *
 * One template body serves both source variants via `data-if="hasSpouse"` —
 * the two source .doc files are identical except for the trailing SPOUSE:
 * signature block, exactly the case this attribute exists for. `hasSpouse`
 * is derived from the borrower's own captured `civilStatus` field
 * (template-context.ts); the spouse's printed name has no source anywhere
 * in the system yet, so `{{spouseName}}` renders blank for the borrower to
 * fill in by hand, same convention as `witnessOne`/`witnessTwo`.
 */
export const SOURCE_FAITHFUL_AR_ATM_VOUCHER_PREVIEW = String.raw`
<div data-accurate data-document-footer="none">
<div data-align="right"><img class="doc-logo" src="logo.png" alt="Loan Star Lending Group Corp." width="160"></div>
<h2 data-align="center">SURRENDER OF BANK ATM CARD</h2>

<p>I, <b><u>{{borrowerName}}</u></b> of legal age and residing at <b><u>{{address}}</u></b>, surrender my <b>Bank ATM Card</b> to <b><u>LOAN STAR LENDING GROUP CORP. (LSLGC for brevity)</u></b>, for payment of my loan in the sum of <b><u>{{totalLoanAndCentavosInWords}}</u></b> (<b><u>Php {{totalLoan}}</u></b>), Philippine currency, to be paid in <b><u>{{termsInWords}}</u></b> months term with monthly amortization of <b><u>{{monthlyAmortizationAndCentavosInWords}}</u></b> (<b><u>Php {{monthlyAmortization}}</u></b>). I accept and understood the Terms and Conditions that LSLGC will only withdraw and take the amount equivalent to my monthly amortization starting on <b><u>{{firstPaymentDate}}</u></b> and the succeeding monthly installments thereafter until the obligation is fully settled, without need of any further notice, demand, act or deed on the part of LSLGC.</p>

<p>My ATM Card details and status upon surrender;</p>

<table data-plain><tbody>
<tr><td>BANK NAME</td><td data-align="center">:</td><td data-underline>&nbsp;</td></tr>
<tr><td>CARD NUMBER</td><td data-align="center">:</td><td data-underline>&nbsp;</td></tr>
<tr><td>PIN</td><td data-align="center">:</td><td data-underline>&nbsp;</td></tr>
<tr><td>ACCOUNT TYPE</td><td data-align="center">:</td><td data-underline>&nbsp;</td></tr>
<tr><td>INITIAL BALANCE</td><td data-align="center">:</td><td data-underline>Php</td></tr>
<tr><td>REMARKS</td><td data-align="center">:</td><td data-underline>&nbsp;</td></tr>
</tbody></table>

<p>I further manifest, that I hereby waive all my rights, claims and/or cause of actions against LSLGC Directors, Stockholders, Officers, Staff and Representatives.</p>

<table data-plain><tbody>
<tr><td>BORROWER:</td><td>RECEIVED BY:</td></tr>
</tbody></table>

<table data-plain><tbody>
<tr>
<td data-align="center"><b>{{borrowerName}}</b><br/>____________________________<br/><i>(Signature Over printed Name)</i></td>
<td data-align="center">____________________________<br/><i>(Signature Over printed Name)</i></td>
</tr>
</tbody></table>

<div data-if="hasSpouse">
<p>SPOUSE:</p>
<table data-plain><tbody>
<tr><td data-align="center"><b>{{spouseName}}</b><br/>____________________________<br/><i>(Signature Over printed Name)</i></td></tr>
</tbody></table>
</div>
</div>`;
