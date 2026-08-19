-- Phase 10: seed Deed of Chattel Mortgage (Car Refinancing) and Real Estate
-- Mortgage/Annotation (Real Estate) as published release templates.
-- DEMO/PLACEHOLDER CONTENT — user explicitly asked for demo templates to
-- unblock the end-to-end flow (2026-08-19), not the client's real,
-- legal-reviewed chattel-mortgage/REM documents. Must be swapped via the
-- document-template system before any real collateral loan is released.
-- Merge keys strictly from src/lib/lra/template-context.ts (no vehicle/
-- property-specific fields exist yet — those live in the CIG CM/REM
-- Inspection forms, Phase 8, not the release-document context — so this
-- draft references "as described in the CI Inspection Report on file"
-- rather than fabricating fields the system doesn't capture at release time).

-- --------------------------------------------------------------------------
-- Deed of Chattel Mortgage (Car Refinancing)
-- --------------------------------------------------------------------------
WITH t AS (
  INSERT INTO public.document_templates (slug, name, description, category)
  VALUES (
    'deed_of_chattel_mortgage',
    'Deed of Chattel Mortgage',
    'Vehicle chattel mortgage for Car Refinancing collateral loans. DEMO/PLACEHOLDER wording until Legal review and the client''s real template is supplied.',
    'release'
  )
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name,
        description = EXCLUDED.description,
        category = EXCLUDED.category
  RETURNING id
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT id, 1, $body$
<div style="text-align:center"><h2>{{companyName}}</h2></div>
<h3 style="text-align:center">DEED OF CHATTEL MORTGAGE</h3>
<p style="text-align:right">{{todayDate}}</p>

<p><b>[DEMO/PLACEHOLDER — pending Legal review and the client's real chattel mortgage template]</b> This draft is structurally complete for system generation and in-branch signing. It must be replaced with the client's actual legal-reviewed Deed of Chattel Mortgage before any real Car Refinancing loan is released.</p>

<p>This Deed of Chattel Mortgage is entered into by and between:</p>
<p><b>Mortgagee (Lender):</b> {{companyName}}</p>
<p><b>Mortgagor (Borrower):</b> {{borrowerName}} (Borrower No. {{borrowerNo}})<br/>
<b>Address:</b> {{address}}</p>

<p><b>1. Loan Particulars Secured by this Mortgage</b></p>
<table><tbody>
<tr><td><b>Loan Account No.:</b></td><td>{{loanAccountNo}}</td></tr>
<tr><td><b>Loan Type:</b></td><td>{{loanType}}</td></tr>
<tr><td><b>Principal Amount:</b></td><td>Php {{principal}} ({{principalInWords}})</td></tr>
<tr><td><b>Terms:</b></td><td>{{terms}} months</td></tr>
<tr><td><b>Monthly Amortization:</b></td><td>Php {{monthlyAmortization}} ({{monthlyAmortizationInWords}})</td></tr>
<tr><td><b>Date Released:</b></td><td>{{dateReleased}}</td></tr>
</tbody></table>

<p><b>2. Property Mortgaged</b></p>
<p>[DEMO/PLACEHOLDER — pending Legal review] The Mortgagor hereby conveys and mortgages, by way of chattel mortgage, the motor vehicle described in the CI Inspection Report (CM Inspection) on file with the Mortgagee for this loan account, as security for the faithful performance of the obligation stated above.</p>

<p><b>3. Obligations</b></p>
<p>[DEMO/PLACEHOLDER — pending Legal review] The Mortgagor agrees to keep the mortgaged vehicle insured, free from other liens, and in good condition, and to surrender the Official Receipt/Certificate of Registration (OR/CR) or annotate this mortgage thereon as required by law, for the duration of the loan.</p>

<p><b>4. Default and Foreclosure</b></p>
<p>[DEMO/PLACEHOLDER — pending Legal review] Failure to pay any installment when due, or breach of any material term of this Deed or the Promissory Note, may render the outstanding balance immediately due and demandable and entitle the Mortgagee to foreclose on the mortgaged vehicle in accordance with the Chattel Mortgage Law and applicable regulations.</p>

<p><b>5. Governing Law</b></p>
<p>[DEMO/PLACEHOLDER — pending Legal review] This Deed shall be governed by the laws of the Republic of the Philippines, including the Chattel Mortgage Law (Act No. 1508). Venue for actions arising hereunder may be brought in the proper courts of Makati City or elsewhere in the Philippines at the discretion of {{companyName}}.</p>

<p>&nbsp;</p>
<table><tbody><tr>
<td>____________________________<br/><b>{{borrowerName}}</b><br/>MORTGAGOR (Signature Over Printed Name)</td>
<td>____________________________<br/>{{companyName}}<br/>MORTGAGEE (Authorized Signatory)</td>
</tr></tbody></table>
<p><b>Date:</b> {{dateReleased}}</p>
$body$, 'published', now()
FROM t
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_template_versions v
  WHERE v.template_id = t.id AND v.version_no = 1
);

-- --------------------------------------------------------------------------
-- Real Estate Mortgage / Annotation (Real Estate)
-- --------------------------------------------------------------------------
WITH t AS (
  INSERT INTO public.document_templates (slug, name, description, category)
  VALUES (
    'real_estate_mortgage',
    'Real Estate Mortgage',
    'Property mortgage/annotation for Real Estate collateral loans. DEMO/PLACEHOLDER wording until Legal review and the client''s real template is supplied.',
    'release'
  )
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name,
        description = EXCLUDED.description,
        category = EXCLUDED.category
  RETURNING id
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT id, 1, $body$
<div style="text-align:center"><h2>{{companyName}}</h2></div>
<h3 style="text-align:center">REAL ESTATE MORTGAGE</h3>
<p style="text-align:right">{{todayDate}}</p>

<p><b>[DEMO/PLACEHOLDER — pending Legal review and the client's real REM template]</b> This draft is structurally complete for system generation and in-branch signing. It must be replaced with the client's actual legal-reviewed Real Estate Mortgage/Annotation document before any real Real Estate loan is released.</p>

<p>This Real Estate Mortgage is entered into by and between:</p>
<p><b>Mortgagee (Lender):</b> {{companyName}}</p>
<p><b>Mortgagor (Borrower):</b> {{borrowerName}} (Borrower No. {{borrowerNo}})<br/>
<b>Address:</b> {{address}}</p>

<p><b>1. Loan Particulars Secured by this Mortgage</b></p>
<table><tbody>
<tr><td><b>Loan Account No.:</b></td><td>{{loanAccountNo}}</td></tr>
<tr><td><b>Loan Type:</b></td><td>{{loanType}}</td></tr>
<tr><td><b>Principal Amount:</b></td><td>Php {{principal}} ({{principalInWords}})</td></tr>
<tr><td><b>Terms:</b></td><td>{{terms}} months</td></tr>
<tr><td><b>Monthly Amortization:</b></td><td>Php {{monthlyAmortization}} ({{monthlyAmortizationInWords}})</td></tr>
<tr><td><b>Date Released:</b></td><td>{{dateReleased}}</td></tr>
</tbody></table>

<p><b>2. Property Mortgaged</b></p>
<p>[DEMO/PLACEHOLDER — pending Legal review] The Mortgagor hereby conveys and mortgages the real property described in the CI Inspection Report (REM Inspection) on file with the Mortgagee for this loan account, as security for the faithful performance of the obligation stated above. The Mortgagor undertakes to cause this Mortgage to be annotated on the property's Certificate of Title with the Registry of Deeds.</p>

<p><b>3. Obligations</b></p>
<p>[DEMO/PLACEHOLDER — pending Legal review] The Mortgagor agrees to keep the mortgaged property insured where applicable, free from other liens except as disclosed, and to pay all real property taxes when due, for the duration of the loan.</p>

<p><b>4. Default and Foreclosure</b></p>
<p>[DEMO/PLACEHOLDER — pending Legal review] Failure to pay any installment when due, or breach of any material term of this Mortgage or the Promissory Note, may render the outstanding balance immediately due and demandable and entitle the Mortgagee to foreclose on the mortgaged property in accordance with Act No. 3135, as amended, and applicable regulations.</p>

<p><b>5. Governing Law</b></p>
<p>[DEMO/PLACEHOLDER — pending Legal review] This Mortgage shall be governed by the laws of the Republic of the Philippines. Venue for actions arising hereunder may be brought in the proper courts of Makati City or elsewhere in the Philippines at the discretion of {{companyName}}.</p>

<p>&nbsp;</p>
<table><tbody><tr>
<td>____________________________<br/><b>{{borrowerName}}</b><br/>MORTGAGOR (Signature Over Printed Name)</td>
<td>____________________________<br/>{{companyName}}<br/>MORTGAGEE (Authorized Signatory)</td>
</tr></tbody></table>
<p><b>Date:</b> {{dateReleased}}</p>
$body$, 'published', now()
FROM t
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_template_versions v
  WHERE v.template_id = t.id AND v.version_no = 1
);
