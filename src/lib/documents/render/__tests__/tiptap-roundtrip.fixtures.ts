import { SOURCE_FAITHFUL_DISCLOSURE_PREVIEW } from "@/lib/documents/fidelity/disclosure-preview";
import { SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW } from "@/lib/documents/fidelity/promissory-note-preview";
import { SOURCE_FAITHFUL_DEMAND_LETTER_SECOND_NOTICE_PREVIEW } from "@/lib/documents/fidelity/demand-letter-second-notice-preview";
import { SOURCE_FAITHFUL_AR_ATM_VOUCHER_PREVIEW } from "@/lib/documents/fidelity/ar-atm-voucher-preview";
import { SOURCE_FAITHFUL_CONSENT_FORM_PREVIEW } from "@/lib/documents/fidelity/consent-form-preview";
import { SOURCE_FAITHFUL_DEMAND_LETTER_V2_PREVIEW } from "@/lib/documents/fidelity/demand-letter-v2-preview";
import { SOURCE_FAITHFUL_LOAN_AGREEMENT_VIENOVO_PREVIEW } from "@/lib/documents/fidelity/loan-agreement-vienovo-preview";
import { SOURCE_FAITHFUL_DEED_OF_CHATTEL_MORTGAGE_PREVIEW } from "@/lib/documents/fidelity/deed-of-chattel-mortgage-preview";
import { SOURCE_FAITHFUL_CANCELLATION_OF_CHATTEL_MORTGAGE_PREVIEW } from "@/lib/documents/fidelity/cancellation-of-chattel-mortgage-preview";
import { SOURCE_FAITHFUL_VOLUNTARY_SURRENDER_DEED_AUTO_PREVIEW } from "@/lib/documents/fidelity/voluntary-surrender-deed-auto-preview";
import { SOURCE_FAITHFUL_SPA_MORTGAGE_CANCELLATION_PREVIEW } from "@/lib/documents/fidelity/spa-mortgage-cancellation-preview";

/**
 * Representative template-HTML patterns drawn from the 29 published templates —
 * every construct the TipTap schema must round-trip. Kept as a committed fixture
 * so the round-trip test is hermetic (no DB / creds). `tiptap-roundtrip.test.mts`
 * also has an opt-in mode that runs against every live published body.
 */
export const FIXTURES: Record<string, string> = {
  centering_div_heading: `<div style="text-align:center"><h2>{{companyName}}</h2></div>
<h3 style="text-align:center">ACKNOWLEDGEMENT RECEIPT</h3>
<p style="text-align:right">{{todayDate}}</p>`,

  paragraphs_and_bold: `<p>For value received, I/We, <b>{{borrowerName}}</b>, of legal age and residing at {{address}}, promise to pay <b>{{companyName}}</b>.</p>
<p>This is the second paragraph with an <i>italic</i> and <u>underline</u> run.</p>`,

  header_table: `<table><tbody>
<tr><th>Item</th><th>Amount</th></tr>
<tr><td><b>Loan Account No.:</b></td><td>{{loanAccountNo}}</td></tr>
<tr><td><b>Principal:</b></td><td>Php {{principal}}</td></tr>
</tbody></table>`,

  repeat_row: `<table><tbody>
<tr><th>Make / Year Model</th><th>Engine No.</th><th>Plate No.</th></tr>
<tr data-repeat="vehicles"><td>{{makeYearModel}}</td><td>{{engineNo}}</td><td>{{plateNo}}</td></tr>
</tbody></table>`,

  repeat_block: `<div data-repeat="properties">
<p>A parcel/s of land located at {{location}}, covered by TCT {{tctNo}}, consisting of {{areaSqm}} square meters.</p>
<p><b>TECHNICAL DESCRIPTION:</b></p>
<p>{{technicalDescription}}</p>
</div>`,

  conditional_block: `<div data-if="isCorporateBorrower">
<p>&nbsp;</p>
<p><b>{{borrowerName}}</b><br/>Represented by:</p>
<p>____________________________<br/><b>{{borrowerRepresentative}}</b><br/>Authorized Signatory</p>
</div>
<div data-unless="isCorporateBorrower">
<p>____________________________<br/><b>{{borrowerName}}</b><br/>Signature over Printed Name</p>
</div>`,

  paragraph_conditional: `<p data-unless="isFinal">This notice will serve as a warning.</p>
<p data-if="isFinal">This FINAL DEMAND LETTER will serve as your final warning.</p>`,

  span_conditional_midsentence: `<p>Received the amount of <b>{{amount}}</b><span data-if="isCheck">, issued through {{bankName}} with check number {{checkNumber}}</span>.</p>`,

  br_and_entities: `<p>REPUBLIC OF THE PHILIPPINES&nbsp;)<br/>_____________________________&nbsp;) S.S.</p>
<p>Doc. No. {{notaryDocNo}};<br/>Page No. {{notaryPageNo}};<br/>Series of {{notarySeries}}.</p>
<p>&ldquo;as is, where is&rdquo; &mdash; &amp; more.</p>`,

  lists: `<p>Purposes:</p>
<ul><li>first</li><li>second with {{borrowerName}}</li></ul>
<ol><li>one</li><li>two</li></ol>`,

  hr_and_annex: `<p style="text-align:right"><b>ANNEX &ldquo;C&rdquo;</b></p>
<h2 style="text-align:center">VOLUNTARY SURRENDER FORM</h2>
<p>body</p>
<hr/>
<p style="text-align:right"><b>ANNEX &ldquo;D&rdquo;</b></p>`,

  letterhead_logo: `<div data-align="center"><img class="doc-logo" src="{{logoDataUri}}" alt="Loan Star Lending Group Corp."></div>
<h1>PROMISSORY NOTE</h1>
<p>body</p>`,

  disclosure_statement_source_faithful: SOURCE_FAITHFUL_DISCLOSURE_PREVIEW,
  promissory_note_source_faithful: SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW,
  demand_letter_second_notice_source_faithful: SOURCE_FAITHFUL_DEMAND_LETTER_SECOND_NOTICE_PREVIEW,
  ar_atm_voucher_source_faithful: SOURCE_FAITHFUL_AR_ATM_VOUCHER_PREVIEW,
  consent_form_source_faithful: SOURCE_FAITHFUL_CONSENT_FORM_PREVIEW,
  demand_letter_v2_source_faithful: SOURCE_FAITHFUL_DEMAND_LETTER_V2_PREVIEW,
  loan_agreement_vienovo_source_faithful: SOURCE_FAITHFUL_LOAN_AGREEMENT_VIENOVO_PREVIEW,
  deed_of_chattel_mortgage_source_faithful: SOURCE_FAITHFUL_DEED_OF_CHATTEL_MORTGAGE_PREVIEW,
  cancellation_of_chattel_mortgage_source_faithful: SOURCE_FAITHFUL_CANCELLATION_OF_CHATTEL_MORTGAGE_PREVIEW,
  voluntary_surrender_deed_auto_source_faithful: SOURCE_FAITHFUL_VOLUNTARY_SURRENDER_DEED_AUTO_PREVIEW,
  spa_mortgage_cancellation_source_faithful: SOURCE_FAITHFUL_SPA_MORTGAGE_CANCELLATION_PREVIEW,

  // Repeated per-vehicle key/value block, exercised with 2 vehicles (the
  // Phase 4 vehicle-collateral fix: `<div data-repeat="vehicles">` wrapping
  // a per-vehicle 2-column table, the block-repeat equivalent of the
  // already-correct `repeat_block` / `data-repeat="properties"` pattern
  // above — see deed-of-chattel-mortgage-preview.ts's header comment).
  repeat_block_vehicles: `<div data-repeat="vehicles">
<table><tbody>
<tr><th>Make / Year Model</th><td>{{makeYearModel}}</td></tr>
<tr><th>Engine No.</th><td>{{engineNo}}</td></tr>
<tr><th>Chassis No.</th><td>{{chassisNo}}</td></tr>
<tr><th>Plate No.</th><td>{{plateNo}}</td></tr>
<tr><th>CR No.</th><td>{{crNo}}</td></tr>
<tr><th>MV File No.</th><td>{{mvFileNo}}</td></tr>
<tr><th>Registered Owner</th><td>{{registeredOwner}}</td></tr>
</tbody></table>
</div>`,
};
