import test from "node:test";
import assert from "node:assert/strict";

import {
  autoGenerateSlugs,
  loanAgreementSlugFor,
  PATH_SPECIFIC_SLUGS,
  queryPickerItems,
  RELEASE_DOCUMENT_SLUGS,
  SF_RELEASE_SLUGS,
  releaseDocumentCandidates,
  segmentGroup,
  templateConditionMatches,
  type PickerItem,
  type ReleaseTemplateRow,
} from "../release-documents";

/**
 * Catalog fixture matching the G1 seed for every `category = 'release'` slug.
 * `endorsement_letter` has no published version (matches live).
 */
function seededCatalog(): ReleaseTemplateRow[] {
  const alwaysBoth = [
    "blri",
    "promissory_note",
    "disclosure_statement",
    "letter_of_intent",
    "loan_agreement",
    "check_voucher",
    "ar_check_voucher",
    "cash_voucher",
    "ar_atm_voucher",
  ];
  const rows: ReleaseTemplateRow[] = alwaysBoth.map((slug) => ({
    slug,
    name: slug,
    publishedVersionNo: 1,
    seafarerGeneration: "always",
    smeGeneration: "always",
  }));
  rows.push(
    {
      slug: "deed_of_chattel_mortgage",
      name: "Deed of Chattel Mortgage",
      publishedVersionNo: 1,
      seafarerGeneration: "hidden",
      smeGeneration: "always",
    },
    {
      slug: "real_estate_mortgage",
      name: "Real Estate Mortgage",
      publishedVersionNo: 1,
      seafarerGeneration: "hidden",
      smeGeneration: "always",
    },
    {
      slug: "acknowledgement_receipt",
      name: "Acknowledgement Receipt",
      publishedVersionNo: 1,
      seafarerGeneration: "hidden",
      smeGeneration: "optional",
    },
    {
      slug: "ar_cash_voucher",
      name: "AR Cash Voucher",
      publishedVersionNo: 1,
      seafarerGeneration: "hidden",
      smeGeneration: "optional",
    },
    {
      slug: "endorsement_letter",
      name: "Endorsement Letter",
      publishedVersionNo: null,
      seafarerGeneration: "hidden",
      smeGeneration: "optional",
    },
  );
  return rows;
}

const sorted = (xs: string[]) => [...xs].sort();

test("segmentGroup — individual follows sme", () => {
  assert.equal(segmentGroup("seafarer"), "seafarer");
  assert.equal(segmentGroup("sme"), "sme");
  assert.equal(segmentGroup("individual"), "sme");
});

test("templateConditionMatches — voucher pair follows the release path", () => {
  assert.equal(templateConditionMatches("check_voucher", ["with_pdc"], "none"), true);
  assert.equal(templateConditionMatches("ar_check_voucher", ["with_pdc"], "none"), true);
  assert.equal(templateConditionMatches("check_voucher", ["without_pdc"], "none"), false);
  assert.equal(templateConditionMatches("cash_voucher", ["without_pdc"], "none"), true);
  assert.equal(templateConditionMatches("ar_atm_voucher", ["without_pdc"], "none"), true);
  assert.equal(templateConditionMatches("cash_voucher", ["with_pdc"], "none"), false);
  // both paths selected -> both pairs match
  assert.equal(
    templateConditionMatches("check_voucher", ["with_pdc", "without_pdc"], "none"),
    true,
  );
  assert.equal(
    templateConditionMatches("cash_voucher", ["with_pdc", "without_pdc"], "none"),
    true,
  );
});

test("templateConditionMatches — mortgages follow collateral type", () => {
  assert.equal(
    templateConditionMatches("deed_of_chattel_mortgage", ["with_pdc"], "car_refinancing"),
    true,
  );
  assert.equal(
    templateConditionMatches("deed_of_chattel_mortgage", ["with_pdc"], "real_estate"),
    false,
  );
  assert.equal(
    templateConditionMatches("deed_of_chattel_mortgage", ["with_pdc"], "none"),
    false,
  );
  assert.equal(
    templateConditionMatches("real_estate_mortgage", ["with_pdc"], "real_estate"),
    true,
  );
  assert.equal(
    templateConditionMatches("real_estate_mortgage", ["with_pdc"], null),
    false,
  );
});

test("templateConditionMatches — non-conditional slugs always match", () => {
  for (const slug of ["blri", "promissory_note", "acknowledgement_receipt", "endorsement_letter"]) {
    assert.equal(templateConditionMatches(slug, [], "none"), true);
  }
});

test("releaseDocumentCandidates — seafarer drops hidden rows and off-path vouchers", () => {
  const cands = releaseDocumentCandidates("seafarer", seededCatalog(), ["with_pdc"], "none");
  const slugs = sorted(cands.map((c) => c.slug));
  assert.deepEqual(slugs, [
    "ar_check_voucher",
    "blri",
    "check_voucher",
    "disclosure_statement",
    "letter_of_intent",
    "loan_agreement",
    "promissory_note",
  ]);
  // no collateral / cash-path / sme-only rows leak in
  assert.ok(!slugs.includes("cash_voucher"));
  assert.ok(!slugs.includes("deed_of_chattel_mortgage"));
  assert.ok(!slugs.includes("acknowledgement_receipt"));
});

test("releaseDocumentCandidates — sme shows optional rows; canGenerate from published version", () => {
  const cands = releaseDocumentCandidates(
    "sme",
    seededCatalog(),
    ["without_pdc"],
    "car_refinancing",
  );
  const bySlug = new Map(cands.map((c) => [c.slug, c]));
  assert.ok(bySlug.has("acknowledgement_receipt"));
  assert.equal(bySlug.get("acknowledgement_receipt")?.eligibility, "optional");
  assert.ok(bySlug.has("deed_of_chattel_mortgage")); // collateral matches
  assert.ok(!bySlug.has("real_estate_mortgage")); // collateral does not match
  assert.ok(!bySlug.has("check_voucher")); // with_pdc pair off-path
  assert.ok(bySlug.has("cash_voucher"));
  // endorsement_letter is visible but not generatable yet
  assert.equal(bySlug.get("endorsement_letter")?.canGenerate, false);
  assert.equal(bySlug.get("blri")?.canGenerate, true);
});

test("autoGenerateSlugs — seafarer reproduces the old AUTO_GENERATED_SLUGS[path] set", () => {
  const catalog = seededCatalog();

  assert.deepEqual(
    sorted(autoGenerateSlugs("seafarer", catalog, ["with_pdc"], "none")),
    sorted([
      "blri",
      "promissory_note",
      "disclosure_statement",
      "letter_of_intent",
      "loan_agreement",
      "check_voucher",
      "ar_check_voucher",
    ]),
  );

  assert.deepEqual(
    sorted(autoGenerateSlugs("seafarer", catalog, ["without_pdc"], "none")),
    sorted([
      "blri",
      "promissory_note",
      "disclosure_statement",
      "letter_of_intent",
      "loan_agreement",
      "cash_voucher",
      "ar_atm_voucher",
    ]),
  );

  // both paths -> union of both pairs (9)
  assert.equal(
    autoGenerateSlugs("seafarer", catalog, ["with_pdc", "without_pdc"], "none").length,
    9,
  );
});

test("autoGenerateSlugs — excludes optional and unpublished", () => {
  const slugs = autoGenerateSlugs("sme", seededCatalog(), ["without_pdc"], "real_estate");
  assert.ok(slugs.includes("real_estate_mortgage")); // sme 'always' + collateral match
  assert.ok(!slugs.includes("acknowledgement_receipt")); // 'optional'
  assert.ok(!slugs.includes("endorsement_letter")); // 'optional' + unpublished
  assert.ok(!slugs.includes("deed_of_chattel_mortgage")); // collateral mismatch
});

test("RELEASE_DOCUMENT_SLUGS — old union plus the three never-auto slugs", () => {
  for (const slug of [
    "blri",
    "promissory_note",
    "disclosure_statement",
    "letter_of_intent",
    "loan_agreement",
    "check_voucher",
    "ar_check_voucher",
    "cash_voucher",
    "ar_atm_voucher",
    "deed_of_chattel_mortgage",
    "real_estate_mortgage",
    "acknowledgement_receipt",
    "ar_cash_voucher",
    "endorsement_letter",
  ]) {
    assert.ok(RELEASE_DOCUMENT_SLUGS.has(slug), `missing ${slug}`);
  }
  for (const slug of SF_RELEASE_SLUGS) {
    assert.ok(RELEASE_DOCUMENT_SLUGS.has(slug), `missing ${slug}`);
  }
  for (const slug of ["loan_agreement_bi_monthly", "loan_agreement_per_day", "loan_agreement_vienovo"]) {
    assert.ok(RELEASE_DOCUMENT_SLUGS.has(slug), `missing ${slug}`);
  }
  assert.equal(RELEASE_DOCUMENT_SLUGS.size, 14 + SF_RELEASE_SLUGS.length + 3);
  assert.ok(!RELEASE_DOCUMENT_SLUGS.has("application_form"));
});

test("PATH_SPECIFIC_SLUGS — voucher pairs, shared and seafarer-only", () => {
  assert.deepEqual(PATH_SPECIFIC_SLUGS.with_pdc, [
    "check_voucher",
    "ar_check_voucher",
    "check_voucher_sf",
    "ar_check_voucher_sf",
    "ar_multiple_check_sf",
  ]);
  assert.deepEqual(PATH_SPECIFIC_SLUGS.without_pdc, [
    "cash_voucher",
    "ar_atm_voucher",
    "cash_voucher_sf",
    "ar_atm_voucher_sf",
    "ar_cash_voucher_sf",
  ]);
});

test("seafarer-only templates follow the same path condition as the shared ones", () => {
  const catalog: ReleaseTemplateRow[] = SF_RELEASE_SLUGS.map((slug) => ({
    slug,
    name: slug,
    publishedVersionNo: 1,
    // Multiple Check is the LRA's pick (a release split across several checks).
    seafarerGeneration: slug === "ar_multiple_check_sf" ? "optional" : "always",
    smeGeneration: "hidden",
  }));
  assert.deepEqual(autoGenerateSlugs("seafarer", catalog, ["with_pdc"], "none"), [
    "loan_information_sf",
    "blri_sf",
    "promissory_note_sf",
    "disclosure_statement_sf",
    "check_voucher_sf",
    "ar_check_voucher_sf",
    "payment_details_sf",
  ]);
  assert.deepEqual(autoGenerateSlugs("seafarer", catalog, ["without_pdc"], "none"), [
    "loan_information_sf",
    "blri_sf",
    "promissory_note_sf",
    "disclosure_statement_sf",
    "cash_voucher_sf",
    "ar_atm_voucher_sf",
    "ar_cash_voucher_sf",
    "payment_details_sf",
  ]);
  const withPdc = releaseDocumentCandidates("seafarer", catalog, ["with_pdc"], "none").map((c) => c.slug);
  assert.ok(withPdc.includes("ar_multiple_check_sf"));
  assert.ok(!withPdc.includes("ar_cash_voucher_sf"));
  assert.deepEqual(autoGenerateSlugs("sme", catalog, ["with_pdc"], "none"), []);
});

// --- queryPickerItems: server-side search / filter / pagination -------------

function gen(over: Partial<PickerItem["generated"]> = {}): PickerItem["generated"] {
  return {
    documentId: "d1",
    generatedAt: "2026-09-10T00:00:00.000Z",
    signedAt: null,
    isFinalized: false,
    downloadUrl: null,
    ...over,
  };
}

function pickerFixture(): PickerItem[] {
  return [
    { slug: "blri", name: "BLRI (Loan Release Information)", eligibility: "always", canGenerate: true, generated: null },
    { slug: "promissory_note", name: "Promissory Note", eligibility: "always", canGenerate: true, generated: gen() },
    { slug: "disclosure_statement", name: "Disclosure Statement", eligibility: "always", canGenerate: true, generated: gen({ signedAt: "2026-09-10T01:00:00.000Z" }) },
    { slug: "letter_of_intent", name: "Letter of Intent", eligibility: "always", canGenerate: true, generated: null },
    { slug: "loan_agreement", name: "Loan Agreement", eligibility: "always", canGenerate: true, generated: null },
    { slug: "check_voucher", name: "Check Voucher", eligibility: "always", canGenerate: true, generated: null },
    { slug: "ar_check_voucher", name: "AR Check Voucher", eligibility: "always", canGenerate: true, generated: null },
    { slug: "acknowledgement_receipt", name: "Acknowledgement Receipt", eligibility: "optional", canGenerate: true, generated: null },
    { slug: "endorsement_letter", name: "Endorsement Letter", eligibility: "optional", canGenerate: false, generated: null },
  ];
}

test("queryPickerItems — default page 1, pageSize 6", () => {
  const r = queryPickerItems(pickerFixture(), {});
  assert.equal(r.total, 9);
  assert.equal(r.pageSize, 6);
  assert.equal(r.pageCount, 2);
  assert.equal(r.page, 1);
  assert.equal(r.items.length, 6);
  assert.equal(r.items[0].slug, "blri");
});

test("queryPickerItems — page 2 returns the remainder", () => {
  const r = queryPickerItems(pickerFixture(), { page: 2 });
  assert.equal(r.page, 2);
  assert.equal(r.items.length, 3);
  assert.deepEqual(
    r.items.map((i) => i.slug),
    ["ar_check_voucher", "acknowledgement_receipt", "endorsement_letter"],
  );
});

test("queryPickerItems — page is clamped into range", () => {
  assert.equal(queryPickerItems(pickerFixture(), { page: 99 }).page, 2);
  assert.equal(queryPickerItems(pickerFixture(), { page: 0 }).page, 1);
  assert.equal(queryPickerItems(pickerFixture(), { page: "abc" }).page, 1);
});

test("queryPickerItems — search matches name or slug, case-insensitive", () => {
  const r = queryPickerItems(pickerFixture(), { search: "voucher" });
  assert.deepEqual(
    r.items.map((i) => i.slug),
    ["check_voucher", "ar_check_voucher"],
  );
  assert.equal(r.total, 2);
  assert.equal(
    queryPickerItems(pickerFixture(), { search: "BLRI" }).items[0].slug,
    "blri",
  );
});

test("queryPickerItems — requirement filter", () => {
  const req = queryPickerItems(pickerFixture(), { eligibility: "required", pageSize: 50 });
  assert.ok(req.items.every((i) => i.eligibility === "always"));
  assert.equal(req.total, 7);

  const opt = queryPickerItems(pickerFixture(), { eligibility: "optional", pageSize: 50 });
  assert.deepEqual(
    opt.items.map((i) => i.slug),
    ["acknowledgement_receipt", "endorsement_letter"],
  );
});

test("queryPickerItems — status filter", () => {
  const ng = queryPickerItems(pickerFixture(), { status: "not_generated", pageSize: 50 });
  assert.ok(ng.items.every((i) => i.generated === null));
  assert.equal(ng.total, 7);

  const g = queryPickerItems(pickerFixture(), { status: "generated", pageSize: 50 });
  assert.deepEqual(g.items.map((i) => i.slug), ["promissory_note"]); // generated, not signed

  const s = queryPickerItems(pickerFixture(), { status: "signed", pageSize: 50 });
  assert.deepEqual(s.items.map((i) => i.slug), ["disclosure_statement"]);
});

test("queryPickerItems — filters combine, unknown values fall back to all", () => {
  const r = queryPickerItems(pickerFixture(), {
    search: "voucher",
    eligibility: "required",
    status: "not_generated",
    pageSize: 50,
  });
  assert.deepEqual(r.items.map((i) => i.slug), ["check_voucher", "ar_check_voucher"]);

  const bogus = queryPickerItems(pickerFixture(), {
    eligibility: "nonsense" as never,
    status: "nonsense" as never,
  });
  assert.equal(bogus.total, 9);
});

test("queryPickerItems — pageSize is clamped to [1, 50]", () => {
  assert.equal(queryPickerItems(pickerFixture(), { pageSize: 0 }).pageSize, 1);
  assert.equal(queryPickerItems(pickerFixture(), { pageSize: 999 }).pageSize, 50);
});

test("exactly one loan agreement applies to a loan, chosen by payment frequency", () => {
  assert.equal(loanAgreementSlugFor(undefined), "loan_agreement");
  assert.equal(loanAgreementSlugFor("monthly"), "loan_agreement");
  assert.equal(loanAgreementSlugFor("semi_monthly"), "loan_agreement");
  assert.equal(loanAgreementSlugFor("bi_monthly"), "loan_agreement_bi_monthly");
  assert.equal(loanAgreementSlugFor("daily"), "loan_agreement_per_day");
  assert.equal(loanAgreementSlugFor("quarterly_special"), "loan_agreement_vienovo");
  assert.equal(loanAgreementSlugFor("two_monthly"), "loan_agreement_vienovo");

  const catalog: ReleaseTemplateRow[] = [
    "loan_agreement",
    "loan_agreement_bi_monthly",
    "loan_agreement_per_day",
    "loan_agreement_vienovo",
  ].map((slug) => ({
    slug,
    name: slug,
    publishedVersionNo: 1,
    seafarerGeneration: slug === "loan_agreement" ? "always" : "hidden",
    smeGeneration: "always",
  }));
  const forFrequency = (frequency?: string) =>
    autoGenerateSlugs("sme", catalog, ["with_pdc"], "none", frequency);
  assert.deepEqual(forFrequency(), ["loan_agreement"]);
  assert.deepEqual(forFrequency("bi_monthly"), ["loan_agreement_bi_monthly"]);
  assert.deepEqual(forFrequency("daily"), ["loan_agreement_per_day"]);
  assert.deepEqual(forFrequency("two_monthly_special"), ["loan_agreement_vienovo"]);
  // Seafarer loans are always monthly, so they only ever see the standard one.
  assert.deepEqual(autoGenerateSlugs("seafarer", catalog, ["with_pdc"], "none"), ["loan_agreement"]);
});
