-- Phase 9 (Wave 2) of the Collector Discount in DCRR feature. See
-- docs/revision-plans/feature-collector-discount-implementation-plan.md.
--
-- Seeds the payment_receipt document template — a document type that did
-- not exist anywhere in this system before this feature. Category
-- "collection", alongside the existing demand_letter, same table/pattern
-- used by every other document template (see 20260714030530).
--
-- New keys (feature-collector-discount-implementation-plan.md, Phase 9):
--   paymentAmount, paymentDate, referenceNo, hasDiscount,
--   hasInterestDiscount, interestDiscountAmount, interestDiscountedInstallments,
--   hasPenaltyDiscount, penaltyDiscountAmount, penaltyDiscountedInstallments,
--   totalDiscountAmount, discountReason.
--
-- Seeded published (status='published') immediately, same as demand_letter
-- and acknowledgement_receipt — this is a straightforward receipt, not
-- the Legal-review case endorsement_letter needed.
WITH t AS (
  INSERT INTO public.document_templates (slug, name, description, category)
  VALUES ('payment_receipt', 'Payment Receipt',
          'Receipt for a posted payment, showing any Collector-approved interest/penalty discount that actually took effect.',
          'collection')
  RETURNING id
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT id, 1, $body$
<div style="text-align:center"><h2>{{companyName}}</h2></div>
<h3 style="text-align:center">PAYMENT RECEIPT</h3>
<p style="text-align:right">{{todayDate}}</p>
<p><b>{{borrowerName}}</b><br/>{{address}}</p>
<p><b>Loan Account No.:</b> {{loanAccountNo}}</p>
<table><tbody>
<tr><th>Payment Date</th><td>{{paymentDate}}</td></tr>
<tr><th>Reference No.</th><td>{{referenceNo}}</td></tr>
<tr><th><b>Amount Paid</b></th><td style="text-align:right"><b>PHP {{paymentAmount}}</b></td></tr>
</tbody></table>
<div data-if="hasDiscount">
<p><b>Discount breakdown</b></p>
<table><tbody>
<tr data-if="hasInterestDiscount"><th>Interest discount (installment no. {{interestDiscountedInstallments}})</th><td style="text-align:right">PHP {{interestDiscountAmount}}</td></tr>
<tr data-if="hasPenaltyDiscount"><th>Penalty discount (installment no. {{penaltyDiscountedInstallments}})</th><td style="text-align:right">PHP {{penaltyDiscountAmount}}</td></tr>
<tr><th><b>Total Discount</b></th><td style="text-align:right"><b>PHP {{totalDiscountAmount}}</b></td></tr>
</tbody></table>
<p>{{discountReason}}</p>
</div>
<p>This receipt confirms the above payment has been recorded against the account named above.</p>
<p>Very truly yours,</p>
<p>&nbsp;</p>
<p>____________________________<br/>{{companyName}}<br/>Collection Department</p>
$body$, 'published', now()
FROM t;
