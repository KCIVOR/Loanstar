/**
 * The real `promissory_note` template body (source of truth as of 2026-09-25
 * — draft v6, built on the now-published v5). Reconciled against the actual
 * client PDF (`PN - MPL.pdf`, Alfredo Sabater Tiu), word-for-word, per an
 * explicit "100% identical" request — including the source's own internal
 * typos/inconsistencies (e.g. "of with" for "or with" in clause 1, "any all
 * sums" for "any and all sums" in clause 4, "waiver as such right" in clause
 * 5's sub-clause). Per this project's established convention (see
 * demand-letter-sme-preview.ts's header comment), these are reproduced
 * verbatim, not corrected — the design doc's rule is to record
 * inconsistencies, not reinterpret content.
 *
 * Two real bugs fixed in earlier passes, both kept:
 *  1. The opening paragraph's installment-date clause used a computed
 *     `installmentDayOrdinal` field (see `src/lib/lra/blri-data.ts`'s
 *     `ordinalDay()`) instead of a hardcoded "the same day".
 *  2. The signature block has the "Issued on" ID-issuance-date line (using
 *     `borrowerIdIssuedOn` — no source yet, stays blank) and the "ID. No."
 *     label the original uses, not a bare "TIN:".
 *
 * The IN WITNESS WHEREOF / SUBSCRIBE AND SWORN block, by explicit request,
 * now matches the source's own hand-fill blanks exactly (4 separate
 * underscore runs, and the source's own "this Issued on ___ day of" wording
 * glitch) instead of the cleaner {{executionPlace}}/{{executionDate}}
 * auto-fill previously used — this section is not computed in the original
 * at all, it's meant to be filled in by hand at signing/notarization.
 *
 * The signature/notary tables use `data-plain` (borderless layout table) —
 * the original source has no visible grid lines around these blocks, just
 * plain two-column text.
 */
export const SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW = String.raw`
<h2 style="text-align:center">PROMISSORY NOTE</h2>

<p>For value received, I/We, <b>{{borrowerName}}</b>, of legal age and residing at {{address}}, promise to pay <b>{{companyName}}</b> (LSLGC for brevity), or ORDER the sum of {{principalAndCentavosInWords}} (Php {{principal}}), Philippine currency, and I/We have accepted the Terms and Conditions of this Promissory Note (&ldquo;NOTE&rdquo; for brevity) to pay the loan. Furthermore, I/We promise, jointly and severally, to pay this loan in {{termsInWords}} months in the amount of {{monthlyAmortizationAndCentavosInWords}} (Php {{monthlyAmortization}}) per month starting on {{firstPaymentDate}} with a monthly interest of {{interestRateInWords}} and the succeeding monthly installments on the {{installmentDayOrdinal}} day of every month thereafter until the obligation is fully paid, without need of any further notice, demand, act or deed on the part of LSLGC.</p>

<p>1. I/We understand that the happening of any of the following events shall be considered as Defaults on the OBLIGATION covered by this Note which shall thereupon become automatically due and demandable, without need of prior notice or demand, to wit; (a) failure to pay on due date any installments and/or penalty; (b) attachment or garnishment of any property, change in ownership or management, death, dissolution, receivership, insolvency, suspension of payments, or of usual business, or any similar proceedings, of me/us or of my/our co-makers, sureties; (c) default in payment by me/us or of my/our co-makers or sureties, of any other present or future loan obligation, whether due to LSLGC or any other third party/ies; (d) any material representation or warranty made by me/us in this Note or any other document relative to this Note shown to be incorrect, misleading, false or fraudulent; (e) any act or event which, in LSLGC's opinion, result in the impairment of my/our financial responsibility/ies; and, (f) failure to comply with the terms and conditions of this Note or any other documents, affidavits or any agreements relative thereto, of with the requirements of applicable laws.</p>

<p>2. In case any installment is not paid when this Note becomes due and demandable or when any of the events enumerated under paragraph 1 of this Note is violated, I/We, without need of demand, shall be liable to pay penalty of five percent (5%) compounded monthly or plus twenty-five hundredths' percent (0.25%) fraction thereof computed from the unpaid installments or on the whole remaining balance penalty charge.</p>

<p>3. I/We hereby promise/s to pay unconditionally to LSLGC the full obligation amount on the ground that I/We will not be able to pay at least two (2) monthly amortizations, at the option of the LSLGC. The entire balance of this Note shall become immediately due and demandable.</p>

<p>4. Likewise, I/We hereby understand that the value of this Note and any all sums payable hereunder consist of the principal and the recomputed interest covering the term of this Note at the rate stated thereof. The interest rate stipulated in this Note shall be considered as a floor rate and may be changed by the parties, from time to time, and at any time prior to the payment of this note. However, it is understood that LSLGC shall send I/We a written notice as to the proposed new interest rate, together with the adjusted rate of the installment payment based on the new interest rate. Thus, from receipt of the said notice I/we shall have thirty (30) days to agree to the new interest rate by giving written notice to the LSLGC. Accordingly, I/we hereby agree that my/our failure/s to give the appropriate written notice shall be construed as my/our consent to such new interest rate.</p>
<p>i. However, in the event that I/We agree to the proposed new interest rate, I/We hereby agree to execute and deliver any and all documents, including but not limited to the new promissory note/s as may be deemed necessary by LSLGC. But, should the new interest rate be not acceptable by me/us, then this Note shall be automatically considered as due and demandable at the expiration of the thirty (30)-days period herein mentioned without need of further notice or demand to me/us and I/we hereby agree to pay the entire remaining unpaid balance thereon.</p>

<p>5. In case of pre-payment of this Note, I/We agree to pay penalty equivalent to one month interest or {{interestRateInWords}} of the principal amount to be paid under this Note, except when not allowed under R.A. No. 7394 otherwise known as the &ldquo;The Consumer Act of the Philippines&rdquo;.</p>
<p>i. However, the acceptance by LSLGC of any installment payments or any part thereof after due date shall neither be considered as extending the time for the payment of any of the installments aforesaid nor a modification of any conditions thereof. Nor shall the failure of LSLGC to exercise any of its rights under this note shall constitute or be deemed as waiver as such right.</p>

<p>6. I/We expressly consent to any extension or renewal, or restructuring, in whole or in part, and/or partial payment of this Note, which may be requested by or granted to me/us, and to any change in the interest and other terms and conditions of the OBLIGATION as a result of said extension or renewal, and shall continue to be liable thereon, without the necessity of executing a new Promissory Note provided that I/We must first settle/pay two (2) consecutive monthly payments/installments.</p>
<p>i. Acceptance by LSLGC of payment of any installment or any part thereof after due date shall neither be considered as extending the time for the payment of any of the installments aforesaid nor a modification of any conditions thereof. Nor shall the failure of LSLGC to exercise any of its rights under this note shall constitute or be deemed as waiver of such right.</p>

<p>7. As a guaranty for any extension or renewal, or restructuring of this Note, I/We agree to issue a signed but undated check and blank amount in favor of LSLGC wherein the latter shall hold the same as guaranty and shall not be deposited while I/We faithfully comply with the provisions contained on this Note and other relative documents. Accordingly, I/We understand that the undated checks are only for the following purposes: (a) payment of penalty; (b) payment of new monthly amortization in any extension or renewal, or restructuring made on the promissory note and (c) payment in full obligation when the event enumerated under paragraph 3 is violated. Restructuring of loan may either be to shorten or extend the loan term.</p>
<p>i. Thus, in the event that I/We incur any violations as defined in paragraph one (1) of this Note, in paying the monthly installment, I/We hereby authorize LSLGC to fill-up the material particulars of the check, which shall be based on the latest Statement of Account.</p>

<p>8. Presentments, demand, notice of dishonor, protest or notice of any kind, are hereby expressly waived by me/us.</p>

<p>9. It is understood, that should it become necessary for LSLGC to take any legal action to enforce collection of this Note or institute any legal action and/or exercise/avail of its rights/remedies under this Note or by law or equity, I/We shall pay an additional sum equal to fifteen percent (15%) of the amount due as attorney's fees and/or third-party collection agency, in case of default and no legal action is filed. I/We shall pay to LSLGC an attorney's fees equivalent to thirty percent (30%) of the total unpaid obligation, in case wherein a legal action is filed in the appropriate court plus the sum of twenty-five percent (25%) representing liquidated damages, in addition cost of suit. In case of judicial enforcement. I/We hereby knowingly and voluntarily waive the benefits of Rule 39, Section 12 of the Revised Rules of Court.</p>

<p>10. Any action to enforce payment of the Note recovered by the same or to enforce such other right/remedy or any action that may be brought by LSLGC or that I/We may file in connection with this note involving LSLGC, I/We voluntarily agree that the said case shall be filed exclusively in the proper Court of Makati City. The foregoing, however, shall not limit the right to commence the proceeding or obtain execution of judgment against the undersigned in any venue or jurisdiction where assets of the undersigned may be found.</p>

<p>11. All notice and/or correspondence relative to this note, including but not limited to demand letters, summons, and subpoenas shall be sent to my/our address stated above or at the address that may hereafter be given in writing by me/us to LSLGC. The mere act of sending any notice or correspondence by mail or by delivery to the aforesaid address shall be valid and effective upon me/us only. All notice and/or correspondence relative to this note shall be made by me/us only. Furthermore, all notice, and/or correspondences relative to this Note, whether or not I/we am/are abroad or any other place shall be sent to my/our address/es stated herein, or to a new address within the Philippines, wherein I/We shall notify LSLGC thereof in writing.</p>

<p>12. All taxes, charges and expenses including notarial fees for the execution and registration of this Note, as well as its extension, renewal, amendment, modification or cancellation, including documentation stamps taxes a reasonable out of pocket expenses thereto, shall be for my /our account. Such expenses if advanced by LSLGC shall be payable upon demand by LSLGC and such obligation shall likewise be secured by this Note.</p>

<p>13. I/We further manifest that I/We hereby waive all my rights, claims and/or cause of actions against its Directors, Stockholders, Officers, Staff and Representatives. That I/We agree that I/We are jointly and severally liable to LSLGC in the event of default on any of the obligations of this Note.</p>

<p>14. If any one of the provisions of this Note or any documents executed in connection herewith shall be declared invalid, illegal or unenforceable, the validity, legality and enforceability of the remaining provisions herein shall not in any way be affected or impaired.</p>

<p>15. I/We have read and understood all the terms and conditions set forth herein and in the said Note.</p>

<p>IN WITNESS WHEREOF, the parties hereto have signed this Note at__________ on the ______ day of ________________, at _______________________.</p>

<table data-plain><tbody><tr>
<td>____________________________<br><b>{{borrowerName}}</b><br>Signature Over Borrower's Name<br>Address: {{address}}<br>ID. No. TIN {{borrowerTin}}<br>Issued on: {{borrowerIdIssuedOn}}</td>
<td>____________________________<br><b>{{coBorrowerName}}</b><br>Signature Over Co-Borrower's Name<br>Address:<br>ID. No.:<br>Issued on:</td>
</tr></tbody></table>

<p>SUBSCRIBE AND SWORN to before me this Issued on ___________day of ________________, in ______________; affiant/s exhibiting to me, the following:</p>
<table data-plain><tbody>
<tr><th>Name</th><th>Identification Card No.</th><th>Validity</th></tr>
<tr><td>{{borrowerName}}</td><td>TIN {{borrowerTin}}</td><td></td></tr>
</tbody></table>
<p>Doc. No. {{notaryDocNo}};<br>Page No. {{notaryPageNo}};<br>Book No. {{notaryBookNo}};<br>Series of {{notarySeries}}.</p>`;
