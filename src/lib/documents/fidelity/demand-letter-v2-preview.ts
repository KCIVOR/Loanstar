/**
 * `demand_letter_v2` — the "without PDC" past-due letter family, transcribed
 * into the schema-safe HTML the Admin template editor actually supports (see
 * disclosure-preview.ts's header comment for the full rationale).
 *
 * Source-diffed directly (antiword) across all 4 retained source files:
 *   - Demand Letter - without PDC - Individual.doc
 *   - Demand Letter - without PDC - Individual - No Address.doc
 *   - Demand Letter - without PDC 2024.doc
 *   - Demand Letter - without PDC 2024 - no address - final.doc
 *
 * All 4 files carry byte-for-byte identical body wording — two demand
 * notices concatenated in one document (a "SECOND NOTICE TO PAY" page
 * followed by a "FINAL NOTICE TO PAY" page, both addressed to the same
 * account, LOAN NO. LA000015 / VIENOVO PHILIPPINES, INC. in every source —
 * a real filled instance kept in the file, not blank boilerplate). This is
 * not a stale-draft situation: they differ along exactly two real,
 * independent dimensions, both reproduced here as conditionals rather than
 * forked into separate slugs (same established pattern as Phase 1's AR ATM
 * `hasSpouse` conditional and Phase 2's consent form
 * `isCorporateBorrower` conditional):
 *
 *   1. `hasAddress` — the "- No Address" files keep the same bordered
 *      address box, just with every line blank. Reproduced here by always
 *      rendering the box and letting `{{address}}` render empty for the
 *      no-address variant (matches the source's own behavior — the box
 *      never disappears, only its contents do) — `hasAddress` still gates
 *      the merge token itself so an editor previewing with the flag off
 *      sees the same blank box the "No Address" source shows.
 *   2. `hasAttentionLine` — the "2024" files add an "Attention: Mr./Ms. …,
 *      Pres" block naming the addressee's officers; the non-2024
 *      "Individual" files have no such block. This is the second real
 *      distinction (not a stale/superseded draft): the 2024 files are
 *      otherwise wording-identical to the non-2024 files, so it reads as
 *      the same letter later adapted to also name a specific signatory,
 *      not a separate legal document.
 *
 * The recipient name ("VIENOVO PHILIPPINES, INC."), its office address, the
 * loan number ("LA000015"), and the attention names ("Mathieu Francis Marie
 * Guillaume", "Charo Mae Abadilla", "Pres") are the one filled-in real
 * instance every source file shares — genericized here to
 * `{{borrowerName}}` / `{{address}}` / `{{loanAccountNo}}` /
 * `{{attentionName}}` / `{{attentionTitle}}` (all pre-existing merge keys
 * except `attentionName`/`attentionTitle`, added to fields.ts). Every other
 * blank in the source (first-notice date, months past due, peso amounts)
 * was already a literal underscore fill-in in the .doc itself — reused
 * here as the pre-existing `firstNoticeDate` / `outstandingBalance` /
 * `penaltyAmount` / `totalAmountDue` merge keys (same fields the sibling
 * `demand_letter` slug's generator already produces), with the
 * amount-in-words portion of each blank left as a literal underscore run
 * since no "in words" merge key exists for these amounts yet — same
 * established convention as the DL2 dishonor-reason blank.
 *
 * `demand_letter_v2` is admin-editable only (no generator wired yet, same
 * as `demand_letter_dishonored_check`) — it renders against
 * buildSampleContext() for preview.
 *
 * Built only from primitives declared in extensions.ts: `data-accurate`,
 * plain bordered `<table>` (address box), `table data-plain` (attention
 * block + signature block), `td data-underline`, `data-align`, `data-if`,
 * native `<b>`/`<br/>`.
 */
export const SOURCE_FAITHFUL_DEMAND_LETTER_V2_PREVIEW = String.raw`
<div data-accurate data-document-footer="none">
<p>_________________</p>

<p><b>{{borrowerName}}</b></p>

<table><tbody>
<tr><td><span data-if="hasAddress">{{address}}</span><span data-unless="hasAddress">&nbsp;</span></td></tr>
</tbody></table>

<div data-if="hasAttentionLine">
<table data-plain><tbody>
<tr><td>Attention:</td><td>{{attentionName}}<br/>{{attentionTitle}}</td></tr>
</tbody></table>
</div>

<h3 data-align="center">RE: SECOND NOTICE TO PAY<br/>(LOAN NO. {{loanAccountNo}})</h3>

<p>Gentleman,</p>

<p>I am writing on behalf of our company, LOAN STAR LENDING GROUP CORP., with brevity name LSLGC, informing you that despite our first notice which was sent to you dated {{firstNoticeDate}}, we still haven't received any payment from you as of this date. Based on our record, your account is already past due for {{monthsPastDue}} months, amounting to ________________________________________________ (PHP {{outstandingBalance}}).</p>

<p>In view thereof, may we make a demand for you to pay in full your outstanding obligation within seven (7) days from the receipt of this letter the said amount plus the penalty incurred for the delayed payment amounting to ________________________________________________ (PHP {{penaltyAmount}}). Your total outstanding obligation to pay is amounting to ________________________________________________ (PHP {{totalAmountDue}}). Otherwise, your account will be transferred to our legal department to constrain necessary legal action/s against you in court for collection of the abovementioned sum plus the contractual interests and penalties and recovery of damages, legal interests, and attorney's fees to protect the rights and interests of the company.</p>

<p>This notice will serve as a warning. It would be prudent for you to give preferential attention to this matter.</p>

<table data-plain><tbody>
<tr><td>Sincerely yours,</td><td data-align="right">Received by:</td></tr>
<tr><td data-underline>&nbsp;</td><td data-align="right" data-underline>&nbsp;</td></tr>
<tr><td>Collection Department</td><td data-align="right">Signature Over Printed Name</td></tr>
</tbody></table>

<p>_________________</p>

<p><b>{{borrowerName}}</b></p>

<table><tbody>
<tr><td><span data-if="hasAddress">{{address}}</span><span data-unless="hasAddress">&nbsp;</span></td></tr>
</tbody></table>

<div data-if="hasAttentionLine">
<table data-plain><tbody>
<tr><td>Attention:</td><td>{{attentionName}}<br/>{{attentionTitle}}</td></tr>
</tbody></table>
</div>

<h3 data-align="center">RE: FINAL NOTICE TO PAY<br/>(LOAN NO. {{loanAccountNo}})</h3>

<p>Gentleman,</p>

<p>I am writing on behalf of our company LOAN STAR LENDING GROUP CORP., with the brevity name LSLGC, informing you that this is your FINAL DEMAND LETTER since we have already been calling your attention many times and sending you notices. Yet, we haven't received any payments from your end. It shows based on our record that your past due is already amounting to ________________________________________________ (PHP {{outstandingBalance}}).</p>

<p>In view thereof, may we make a final demand for you to pay in full your outstanding obligation within seven (7) days from the receipt of this letter the said amount plus the penalty incurred for the delayed payment amounting to ________________________________________________ (PHP {{penaltyAmount}}). Your total outstanding obligation to pay is amounting to ________________________________________________ (PHP {{totalAmountDue}}). Otherwise, your account will be transferred to our legal department to constrain necessary legal action/s against you in court for collection of the abovementioned sum plus the contractual interests and penalties and recovery of damages, legal interests, and attorney's fees to protect the rights and interests of the company.</p>

<p>This FINAL DEMAND LETTER will serve as your final warning. It would be prudent for you to give preferential attention to this matter.</p>

<table data-plain><tbody>
<tr><td>Sincerely yours,</td><td data-align="right">Received by:</td></tr>
<tr><td data-underline>&nbsp;</td><td data-align="right" data-underline>&nbsp;</td></tr>
<tr><td>Collection Department</td><td data-align="right">Signature Over Printed Name</td></tr>
</tbody></table>
</div>`;
