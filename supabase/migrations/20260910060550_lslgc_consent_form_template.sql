-- LSLGC SME document templates — Batch 2a: Data Privacy Consent Form (2025).
--
-- NEW template, category = 'release' (LRA-generated at release per client),
-- seafarer_generation = 'hidden', sme_generation = 'always'.
--
-- Source: LSLGC CONSENT FORM 2025{,- Corp,- Individual}.docx — the body is
-- identical across the three; only the closing signature block differs, switched
-- here by data-if="isCorporateBorrower". Merge keys: {{borrowerName}},
-- {{borrowerRepresentative}} (both already in fields.ts). At real release the
-- LRA context supplies borrowerName; isCorporateBorrower / borrowerRepresentative
-- are added to buildReleaseTemplateContext in Batch 3 — until then the corporate
-- branch is simply not shown and the individual signature block is used.
--
-- [VERIFY WORDING] the source reads "retained for a period of two (5) years";
-- seeded here as "five (5) years" (the parenthetical numeral). Legal to confirm.

WITH t AS (
  INSERT INTO public.document_templates (slug, name, description, category,
                                         seafarer_generation, sme_generation)
  VALUES (
    'consent_form',
    'Data Privacy Consent Form (2025)',
    'RA 10173 (Data Privacy Act) consent to the processing of the borrower''s personal data. Signature block switches on isCorporateBorrower.',
    'release', 'hidden', 'always'
  )
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name, description = EXCLUDED.description,
        category = EXCLUDED.category,
        seafarer_generation = EXCLUDED.seafarer_generation,
        sme_generation = EXCLUDED.sme_generation
  RETURNING id
)
INSERT INTO public.document_template_versions (template_id, version_no, body, status, published_at)
SELECT id, 1, $body$
<h2 style="text-align:center">CONSENT FORM</h2>

<p>I/we <b>{{borrowerName}}</b>, grant my/our free, voluntary and unconditional consent to the Processing, Verification, Collection and Remedial department of all Personal Data (as defined below), and account or transaction information or records (collectively, the &ldquo;Information&rdquo;) relating to me/us disclosed/transmitted by me/us in person or by my/our authorized agent/representative/s to the information database system of the Loan Star Lending Group Corp. (LSLGC) and/or any of its authorized agent/s or representative/s as Information controller, by whatever means in accordance with Republic Act (R.A.) 10173, otherwise known as the &ldquo;Data Privacy Act of 2012&rdquo; of the Republic of the Philippines, including its Implementing Rules and Regulations (IRR) as well as all other guidelines and issuances by the National Privacy Commission (NPC).</p>

<p>I/we understand that my/our &ldquo;Personal Data&rdquo; means any information, whether recorded in a material form or not, (a) from which the identity of an individual is apparent or can be reasonably and directly ascertained by the entity holding the information, or when put together with other information would directly and certainly identify an individual, (b) about an individual&rsquo;s race, ethnic origin, marital status, age, color, gender, health, education and religious and/or political affiliations, (c) referring to any proceeding for any offense committed or alleged to have been committed by such individual, the disposal of such proceedings, or the sentence of any court in such proceedings, and (d) issued by government agencies peculiar to an individual which includes, but not limited to, social security numbers and licenses.</p>

<p>I/we understand, further, that Loan Star Lending Group Corp. shall keep the Personal Data and Information and the business and/or transaction/s that I/we do with LSLGC (the &ldquo;Business&rdquo;) in strict confidence, and that the collection and processing of all Personal Data and/or Information by LSLGC may be used for any of the following purposes (collectively, the &ldquo;Purposes&rdquo;):</p>

<p>a. to make decisions relating to the establishment, maintenance or termination of accounts and the establishment, provision or continuation of banking/credit facilities or financial products and/or services including, but not limited to, lending, loan, mortgage and/or other secured transactions.</p>
<p>b. to provide, operate, process and administer LSLGC accounts and services or to process applications for LSLGC accounts, products and/or services, and to maintain service quality and train staff;</p>
<p>c. to undertake activities related to the provision of the LSLGC accounts and services including but not limited to transaction authorization, statement printing and distribution, customer service and conduct of surveys, the provision of research reports, offering documents, product profiles, customer profiling, term sheets or other product related materials, administration of rewards and loyalty programs;</p>
<p>d. to provide product related services and support, including, without limitation, provision of processing or administrative support or acting as an intermediary / nominee shareholder / agent / broker / market participant / counterparty in connection with participation in various products (whether such products are offered by LSLGC);</p>
<p>e. to verify the identity or authority of my/our family members, friends, beneficiaries, attorneys, attorneys-in-fact, shareholders, beneficial owners (if relevant), persons under any partners, committee members, directors, officers or authorized signatories, sureties, guarantors, other security and other individuals, representatives who contact LSLGC or may be contacted by LSLGC;</p>
<p>f. for risk assessment, statistical and trend analysis and planning purposes, including to carry out data processing, credit, risk and anti-money laundering and sanctions analyses, creating and maintaining credit scoring models, and otherwise ensuring potential or ongoing credit worthiness of Data Subjects and Related Person/s, including conducting banking, credit, financial and other background checks and reviews, and maintaining banking, credit and financial history of individuals and the company for present and future reference;</p>
<p>g. to monitor and record calls and electronic communications with Data Subject/s and Related Person/s for record keeping, quality assurance, customer service, training, investigation, litigation and fraud prevention purposes;</p>
<p>h. for crime and fraud detection, prevention, investigation and prosecution;</p>
<p>i. to enforce (including without limitation collecting amounts outstanding) or defend the rights of LSLGC and/or any of its affiliates and subsidiaries, its employees, officers and directors, contractual or otherwise;</p>
<p>j. to perform internal management and management reporting, to operate control and management information systems, and to carry out business risk, control or compliance review or testing, internal audits or enable the conduct of external audits;</p>
<p>k. for marketing to me/us and to individuals with similar profiles, attributes or behavior, financial, credit, investment, loan, mortgage, and other related products or services, conducting market, product and service research, and refining any products or services including by conducting data analysis, and surveys, by various modes of communication including mail, telephone call, SMS, electronic mail, internet, mobile, social media, chat and other technological tools and development;</p>
<p>l. to comply with any obligations, requirements, policies, procedures, measures or arrangements for sharing data and information within LSLGC and prevention or detection of money laundering, terrorist financing or other unlawful activities; and,</p>
<p>m. any other transactions and/or purposes analogous or relating directly thereto.</p>

<p>At the same time, I/we agree that the Information shall be retained by LSLGC for as long as necessary for the fulfillment of any of the aforementioned Purposes, and shall continue to be retained for a period of five (5) years notwithstanding the termination of any of the above Purposes.</p>

<p>Further, I/we understand that, with respect to my/our submission, collection and processing of the Personal Data of Related Person/s, it is my/our duty and responsibility:</p>
<p>(i) to inform said Related Person/s of the Purpose/s for which his/their Personal Data have been submitted, collected and processed by LSLGC,</p>
<p>(ii) to obtain consent from the said Related Person/s for the collection and processing of his/their Personal Data/Information in accordance with the Data Privacy Act of 2012, and</p>
<p>(iii) to inform LSLGC that such consent from said Related Person/s have been obtained.</p>

<p>I/we hereby acknowledge that I/we have been provided with the written notification below on my/our rights as a Data Subject (each, a &ldquo;Right&rdquo;, collectively, the &ldquo;Rights&rdquo;) in accordance with the Data Privacy Act of 2012, to wit:</p>
<p>i. to be informed whether Information and/or Personal Data is being or has been processed.</p>
<p>ii. to require LSLGC to correct any Information and/or Personal Data relating to the Data Subject which is inaccurate;</p>
<p>iii. to object to the processing of the Information and/or Personal Data in case of changes or amendments to the Information and/or Personal Data supplied or declared to the Data Subject;</p>
<p>iv. to access the Information and/or Personal Data;</p>
<p>v. to suspend, withdraw or order the blocking, removal or destruction of the Data Subject's Personal Data from LSLGC's information database system.</p>

<p>I/we acknowledge, further, that if I/we was/were to exercise any of the Rights enumerated above, LSLGC reserves its right to re-evaluate and/or terminate its Business with me/us as well as any of the Purposes and/or LSLGC services/products for which the Information and/or Personal Data has been collected and processed.</p>

<p>I/We have read and understood the above and hereby consent to, agree on, accept and acknowledge these terms of consent for myself/ourselves and/or as agent/s for and on behalf of the principal/s I/we represent by signing below.</p>

<p>Signed in Makati City on _________________, 20______ .</p>

<div data-if="isCorporateBorrower">
<p>&nbsp;</p>
<p><b>{{borrowerName}}</b><br/>Represented by:</p>
<p>&nbsp;</p>
<p>____________________________<br/><b>{{borrowerRepresentative}}</b><br/>Authorized Signatory</p>
</div>
<div data-unless="isCorporateBorrower">
<p>&nbsp;</p>
<p>____________________________<br/><b>{{borrowerName}}</b><br/>Signature over Printed Name</p>
</div>
$body$, 'published', now()
FROM t
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_template_versions v
  WHERE v.template_id = t.id AND v.version_no = 1
);
