-- Seed demand_letter_v2 (currently published with zero versions — an
-- orphaned slug previously flagged for deletion, repurposed per the
-- document-fidelity Phase 3 decision) with a schema-safe transcription of
-- the "without PDC" past-due letter family:
--   Demand Letter - without PDC - Individual.doc
--   Demand Letter - without PDC - Individual - No Address.doc
--   Demand Letter - without PDC 2024.doc
--   Demand Letter - without PDC 2024 - no address - final.doc
--
-- All 4 files diff byte-for-byte identical in wording (verified via
-- antiword) — a two-page letter (SECOND NOTICE TO PAY, then FINAL NOTICE TO
-- PAY) addressed to the same real instance (VIENOVO PHILIPPINES, INC., LOAN
-- NO. LA000015) in every source. Not a stale-draft situation: the 4 files
-- differ along exactly two real, independent dimensions, both reproduced
-- here as conditionals in one template (same established pattern as Phase
-- 1's AR ATM `hasSpouse` conditional and Phase 2's consent form
-- `isCorporateBorrower` conditional) rather than forked into separate
-- slugs:
--   - `hasAddress` — the "- No Address" files keep the same bordered
--     address box, just with every line blank.
--   - `hasAttentionLine` — the "2024" files add an "Attention: Mr./Ms. …,
--     Pres" block naming the addressee's officers; the non-2024
--     "Individual" files have none.
--
-- See demand-letter-v2-preview.ts's header comment for the full
-- source-vs-template diff and merge-field provenance. Round-trips unchanged
-- through the Admin TipTap editor (see tiptap-roundtrip.test.mts:
-- demand_letter_v2_source_faithful) and was rendered via the real Gotenberg
-- pipeline and visually checked against the source page geometry for both
-- the address+attention and no-address/no-attention combinations.
--
-- Idempotent: inserts the reviewed body as a new published version only if
-- no version with this exact body already exists for the slug. Never
-- applied automatically — see AGENTS.md instructions for this
-- document-fidelity phase.

WITH reviewed_body AS (
  SELECT $dlv2$
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
</div>
$dlv2$::text AS body
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT t.id,
       COALESCE((SELECT MAX(version_no) FROM public.document_template_versions WHERE template_id = t.id), 0) + 1,
       b.body,
       'published',
       now()
  FROM public.document_templates t
 CROSS JOIN reviewed_body b
 WHERE t.slug = 'demand_letter_v2'
   AND NOT EXISTS (
     SELECT 1 FROM public.document_template_versions v
      WHERE v.template_id = t.id AND v.body = b.body
   );
