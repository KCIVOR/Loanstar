/**
 * `LSLGC CONSENT FORM 2025 - Corp..docx` / `LSLGC CONSENT FORM 2025 -
 * Individual.docx`, transcribed into the schema-safe HTML the Admin
 * template editor actually supports (see disclosure-preview.ts's header
 * comment for the full rationale). Built only from primitives already
 * declared in extensions.ts: `data-accurate`, `table data-plain`,
 * `data-align`, `span[data-if]`/`span[data-unless]` (single-condition, not
 * nested — nested data-if/data-unless spans do not survive the TipTap
 * round-trip, verified empirically), native `<b>`, `<br/>`, and
 * `<img class="doc-logo">` as its own block-level element.
 *
 * One template body serves both source variants via `isCorporateBorrower`,
 * same as consent_form's original v1 body. Both source files render as a
 * single page with the body text laid out in two newspaper columns; since
 * the TipTap table-cell schema only accepts inline content (no nested
 * `<p>`), the two columns are reproduced with a single-row, two-column
 * `data-plain` table whose cells join their paragraphs with `<br/>`
 * instead of `<p>` — the same technique already used for other data-plain
 * signature/label tables in this codebase, just with longer inline runs.
 * Paragraphs are separated by a single `<br/>` (not a blank-line `<br/><br/>`)
 * so the two columns fit one page the way the source page does — the
 * source's own Word "space after paragraph" gap is smaller than a full
 * blank line, and `td` content here can't carry the block-level `<p>`
 * margin the rest of this codebase's body copy relies on for that gap.
 * A real blank line in the source (the gap before each signature block, and
 * the extra blank line before a "Represented by:"/second-signatory name) is
 * reproduced with a doubled/tripled `<br/>` at exactly those points, mirrored
 * off the paragraph-count in both source `document.xml`s.
 *
 * Wording matches the three retained `.docx` originals byte-for-byte
 * (including their own inconsistencies) except at the merge points
 * ({{borrowerName}}, {{borrowerRepresentative}}, {{coBorrowerName}}):
 * - The source's own "Loan Star Lending Group Corp., shall keep..." comma
 *   is kept as written.
 * - Source item (d) reads "...(whether such products are offered by
 *   LSLGC;" with no closing paren before the semicolon in all three
 *   source files (Corp, Individual, and the un-suffixed draft) — an
 *   apparent typo, kept as written per the source-authority rule rather
 *   than silently corrected.
 * - [VERIFY WORDING] All three source files read "...shall continue to be
 *   retained for a period of two (5) years..." (not "five (5) years") —
 *   kept as written; flagged for client confirmation, not silently fixed.
 *
 * Signature blocks (verified against both rendered sources — neither uses
 * an underscore signature rule; both print the name directly under a
 * blank line, with the label below the name):
 * - Corporate (Corp..docx): company name / "Represented by:" / blank /
 *   blank / {{borrowerRepresentative}} / "Authorized Signatory".
 * - Individual (Individual.docx): {{borrowerName}} / "Signature Over
 *   Printed Name", followed by a second, identically-labelled signature
 *   line for a second individual signatory (the source file's own
 *   R3C119/R3C121 calculator-linked fields, populated with a second name
 *   in the rendered evidence) — mapped here to the same real,
 *   already-merge-catalogued `{{coBorrowerName}}` key and `data-if`
 *   convention disclosure_statement already uses (fields.ts), shown only
 *   when present.
 */
const INTRO = "I/we {{borrowerName}}, grant my/our free, voluntary and unconditional consent to the Processing, Verification, Collection and Remedial department of all Personal Data (as defined below), and account or transaction information or records (collectively, the &ldquo;Information&rdquo;) relating to me/us disclosed/transmitted by me/us in person or by my/our authorized agent/representative/s to the information database system of the Loan Star Lending Group Corp. (LSLGC) and/or any of its authorized agent/s or representative/s as Information controller, by whatever means in accordance with Republic Act (R.A.) 10173, otherwise known as the &ldquo;Data Privacy Act of 2012&rdquo; of the Republic of the Philippines, including its Implementing Rules and Regulations (IRR) as well as all other guidelines and issuances by the National Privacy Commission (NPC).";

const LEFT_COLUMN = [
  INTRO,
  "I/we understand that my/our &ldquo;Personal Data&rdquo; means any information, whether recorded in a material form or not, (a) from which the identity of an individual is apparent or can be reasonably and directly ascertained by the entity holding the information, or when put together with other information would directly and certainly identify an individual, (b) about an individual&rsquo;s race, ethnic origin, marital status, age, color, gender, health, education and religious and/or political affiliations, (c) referring to any proceeding for any offense committed or alleged to have been committed by such individual, the disposal of such proceedings, or the sentence of any court in such proceedings, and (d) issued by government agencies peculiar to an individual which includes, but not limited to, social security numbers and licenses",
  "I/we understand, further, that Loan Star Lending Group Corp., shall keep the Personal Data and Information and the business and/or transaction/s that I/we do with LSLGC (the &ldquo;Business&rdquo;) in strict confidence, and that the collection and processing of all Personal Data and/or Information by LSLGC may be used for any of the following purposes (collectively, the &ldquo;Purposes&rdquo;):",
  "a. to make decisions relating to the establishment, maintenance or termination of accounts and the establishment, provision or continuation of banking/credit facilities or financial products and/or services including, but not limited to, lending, loan, mortgage and/or other secured transactions.",
  "b. to provide, operate, process and administer LSLGC accounts and services or to process applications for LSLGC accounts, products and/or services, and to maintain service quality and train staff;",
  "c. to undertake activities related to the provision of the LSLGC accounts and services including but not limited to transaction authorization, statement printing and distribution, customer service and conduct of surveys, the provision of research reports, offering documents, product profiles, customer profiling, term sheets or other product related materials, administration of rewards and loyalty programs;",
  "d. to provide product related services and support, including, without limitation, provision of processing or administrative support or acting as an intermediary / nominee shareholder / agent / broker / market participant / counterparty in connection with participation in various products (whether such products are offered by LSLGC;",
  "e. to verify the identity or authority of my/our family members, friends, beneficiaries, attorneys, attorneys-in-fact, shareholders, beneficial owners (if relevant), persons under any partners, committee members, directors, officers or authorized signatories, sureties, guarantors, other security and other individuals, representatives who contact LSLGC or may be contacted by LSLGC;",
  "f. for risk assessment, statistical and trend analysis and planning purposes, including to carry out data processing, credit, risk and anti-money laundering and sanctions analyses, creating and maintaining credit scoring models, and otherwise ensuring potential or ongoing credit worthiness of Data Subjects and Related Person/s, including conducting banking, credit, financial and other background checks and reviews, and maintaining banking, credit and financial history of individuals and the company for present and future reference;",
  "g. to monitor and record calls and electronic communications with Data Subject/s and Related Person/s for record keeping, quality assurance, customer service, training, investigation, litigation and fraud prevention purposes;",
  "h. for crime and fraud detection, prevention, investigation and prosecution;",
  "i. to enforce (including without limitation collecting amounts outstanding) or defend the rights of LSLGC and/or any of its affiliates and subsidiaries, its employees, officers and directors, contractual or otherwise;",
  "j. to perform internal management and management reporting, to operate control and management information systems, and to carry out business risk, control or compliance review or testing, internal audits or enable the conduct of external audits;",
  "k. for marketing to me/us and to individuals with similar profiles, attributes or behavior, financial, credit, investment, loan, mortgage, and other related products or services, conducting market, product and service research, and refining any products or services including by conducting data analysis, and surveys, by various modes of communication including mail, telephone call, SMS, electronic mail, internet, mobile, social media, chat and other technological tools and development;",
].join("<br/>");

// Column split point is rebalanced for this template's own font metrics
// (this codebase's 12pt/1.08 body type is not as compact as the source's
// Word type, so the source's own a-h / i-m split runs long in column 2 here)
// — the fidelity contract governs page count/geometry, not which lettered
// clause happens to fall in which column of a reflowed two-column table.
const RIGHT_COLUMN_UPPER = [
  "l. to comply with any obligations, requirements, policies, procedures, measures or arrangements for sharing data and information within LSLGC and prevention or detection of money laundering, terrorist financing or other unlawful activities; and,",
  "m. any other transactions and/or purposes analogous or relating directly thereto.",
  "At the same time, I/we agree that the Information shall be retained by LSLGC for as long as necessary for the fulfillment of any of the aforementioned Purposes, and shall continue to be retained for a period of two (5) years notwithstanding the termination of any of the above Purposes.",
  "Further, I/we understand that, with respect to my/our submission, collection and processing of the Personal Data of Related Person/s, it is my/our duty and responsibility:",
  [
    "(i) to inform said Related Person/s of the Purpose/s for which his/their Personal Data have been submitted, collected and processed by LSLGC,",
    "(ii) to obtain consent from the said Related Person/s for the collection and processing of his/their Personal Data/Information in accordance with the Data Privacy Act of 2012, and",
    "(iii) to inform LSLGC that such consent from said Related Person/s have been obtained.",
  ].join("<br/>"),
  "I/we hereby acknowledge that I/we have been provided with the written notification below on my/our rights as a Data Subject (each, a &ldquo;Right&rdquo;, collectively, the &ldquo;Rights&rdquo;) in accordance with the Data Privacy Act of 2012, to wit:",
  [
    "i. to be informed whether Information and/or Personal Data is being or has been processed.",
    "ii. to require LSLGC to correct any Information and/or Personal Data relating to the Data Subject which is inaccurate;",
    "iii. to object to the processing of the Information and/or Personal Data in case of changes or amendments to the Information and/or Personal Data supplied or declared to the Data Subject;",
    "iv. to access the Information and/or Personal Data;",
    "v. to suspend, withdraw or order the blocking, removal or destruction of the Data Subject's Personal Data from LSLGC's information database system.",
  ].join("<br/>"),
  "I/we acknowledge, further, that if I/we was/were to exercise any of the Rights enumerated above, LSLGC reserves its right to re-evaluate and/or terminate its Business with me/us as well as any of the Purposes and/or LSLGC services/products for which the Information and/or Personal Data has been collected and processed.",
  "I/We have read and understood the above and hereby consent to, agree on, accept and acknowledge these terms of consent for myself/ourselves and/or as agent/s for and on behalf of the principal/s I/we represent by signing below",
  "Signed in Makati City on _________________, 20______ .",
].join("<br/>");

// A line break before the first signature name (the source has one blank
// paragraph there; kept to a single `<br/>` here to help the tighter split
// above still land on one page).
const SIGNATURE_LEAD_IN = "<br/>";

const CORPORATE_SIGNATURE_BLOCK =
  '<span data-if="isCorporateBorrower">{{borrowerName}}<br/>Represented by:<br/><br/>{{borrowerRepresentative}}<br/>Authorized Signatory</span>';

const INDIVIDUAL_SIGNATURE_BLOCK =
  '<span data-unless="isCorporateBorrower">{{borrowerName}}<br/>Signature Over Printed Name</span>'
  + '<span data-if="coBorrowerName"><br/><br/>{{coBorrowerName}}<br/>Signature Over Printed Name</span>';

const RIGHT_COLUMN = `${RIGHT_COLUMN_UPPER}${SIGNATURE_LEAD_IN}${CORPORATE_SIGNATURE_BLOCK}${INDIVIDUAL_SIGNATURE_BLOCK}`;

export const SOURCE_FAITHFUL_CONSENT_FORM_PREVIEW = String.raw`
<div data-accurate data-document-footer="none">
<img class="doc-logo" src="logo.png" alt="Loan Star Lending Group Corp." width="160">
<h2 data-align="center">CONSENT FORM</h2>

<table data-plain><tbody>
<tr>
<td>${LEFT_COLUMN}</td>
<td>${RIGHT_COLUMN}</td>
</tr>
</tbody></table>
</div>`;
