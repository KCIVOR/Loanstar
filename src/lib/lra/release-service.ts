import type { SupabaseClient } from "@supabase/supabase-js";

import { ValidationError } from "@/lib/api/errors";
import { writeAuditEvent } from "@/lib/audit/writer";
import { resolvePerformerNames } from "@/lib/ar/history";
import { initializeArAccount, invoiceScheduleToInstallments } from "@/lib/ar/masterlist";
import {
  generateBiMonthlySchedule,
  generateQuarterlySchedule,
  generateQuarterlySpecialSchedule,
  generateTwoMonthlySchedule,
  generateTwoMonthlySpecialSchedule,
} from "@/lib/ar/schedule";
import { mapBorrowerRow, type BorrowerRow } from "@/lib/borrowers/types";
import { computeInvoiceLoan } from "@/lib/computation/invoice";
import { extractDeductionTargets } from "@/lib/computation/deduction-breakdown";
import { halfUp } from "@/lib/computation/money";
import { addScheduleMonths, advanceSemiMonthly } from "@/lib/computation/release-date";
import { DOCUMENT_BUCKET } from "@/lib/constants";
import { getActiveComputation } from "@/lib/csa/computation";
import { ensureDocumentSlots } from "@/lib/documents/checklist";
import { hashPdf, renderTemplateToPdf } from "@/lib/documents/render";
import {
  loadDocRenderConfig,
  type ResolvedDocRenderConfig,
} from "@/lib/documents/render/engine-config";
import { uploadDocumentBytes } from "@/lib/documents/storage";
import { getPublishedTemplate } from "@/lib/documents/templates/service";
import { createServiceClient } from "@/lib/supabase/server";

import { syncApplicationBlocker, mapReleaseFileRow } from "./blockers";
import { loadBlriContext } from "./blri-data";
import { loadCollateralDocumentContext } from "./collateral-context";
import { unsignedGeneratedDocumentIds } from "./mark-all-signed";
import {
  canRecordRelease,
  releaseStageForPath,
  type ReleasePath,
  type ReleaseFileStatus,
} from "./constants";
import {
  autoGenerateSlugs,
  PATH_SPECIFIC_SLUGS,
  releaseDocumentCandidates,
  segmentGroup,
  type CollateralType,
  type ReleaseTemplateRow,
} from "./release-documents";
import {
  assertPdcCollectedForClose,
  maybePdcCollectBlocker,
} from "./pdc-collect";
import {
  assertEmploymentContractForRelease,
  hasEmploymentContractUploaded,
  releaseBlockerForReadyRelease,
} from "./employment-contract";
import { buildReleaseTemplateContext } from "./template-context";

export { confirmPdcCollected } from "./pdc-collect";

export async function getOrCreateReleaseFile(
  supabase: SupabaseClient,
  applicationId: string,
  actorId: string,
) {
  const { data: existing } = await supabase
    .from("release_files")
    .select("*")
    .eq("loan_application_id", applicationId)
    .maybeSingle();

  if (existing) {
    return mapReleaseFileRow(existing);
  }

  const { data: queueRow } = await supabase
    .from("release_queue")
    .select("computation_id")
    .eq("loan_application_id", applicationId)
    .maybeSingle();

  if (!queueRow) {
    throw new ValidationError("Application is not in the LRA queue");
  }

  const { data: created, error } = await supabase
    .from("release_files")
    .insert({
      loan_application_id: applicationId,
      computation_id: queueRow.computation_id,
      assigned_to: actorId,
      status: "awaiting_path",
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await syncApplicationBlocker(supabase, applicationId, "awaiting_path", {
    actorId,
    applicationStatus: "release_signing",
  });

  return mapReleaseFileRow(created);
}

export async function setReleasePaths(
  supabase: SupabaseClient,
  releaseFileId: string,
  paths: ReleasePath[],
  actorId: string,
  options?: {
    atmBankName?: string;
    atmCardLast4?: string;
    atmAccountNumber?: string;
  },
) {
  if (paths.length === 0) {
    throw new ValidationError("At least one release path is required");
  }

  const file = await getReleaseFile(supabase, releaseFileId);
  const nextStatus: ReleaseFileStatus = paths.includes("with_pdc")
    ? "pdc_encoding"
    : "ready_generate";

  if (paths.includes("without_pdc")) {
    if (!options?.atmBankName?.trim()) {
      throw new ValidationError("ATM bank name is required for Without PDC path");
    }
    if (!options?.atmCardLast4?.trim() || options.atmCardLast4.length !== 4) {
      throw new ValidationError(
        "ATM card last 4 digits are required for Without PDC path",
      );
    }
    if (!options?.atmAccountNumber?.trim()) {
      throw new ValidationError(
        "ATM account number is required for Without PDC path",
      );
    }
  }

  const { data: app, error: appError } = await supabase
    .from("loan_applications")
    .select("borrower_id, segment, entity_type")
    .eq("id", file.loanApplicationId)
    .single();

  if (appError || !app?.borrower_id) {
    throw new Error("Application borrower not found");
  }

  const checklistScope = {
    segment: (app.segment === "sme" || app.segment === "individual"
      ? app.segment
      : "seafarer") as "seafarer" | "sme" | "individual",
    entityType:
      app.entity_type === "individual" || app.entity_type === "corporate"
        ? (app.entity_type as "individual" | "corporate")
        : null,
  };

  const hasAtm = paths.includes("without_pdc");

  const { error } = await supabase
    .from("release_files")
    .update({
      release_paths: paths,
      status: nextStatus,
      atm_bank_name: hasAtm ? options?.atmBankName?.trim() : null,
      atm_card_last4: hasAtm ? options?.atmCardLast4?.trim() : null,
      atm_account_number: hasAtm ? options?.atmAccountNumber?.trim() : null,
      blank_check_from: hasAtm ? null : undefined,
      blank_check_to: hasAtm ? null : undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("id", releaseFileId);

  if (error) {
    throw new Error(error.message);
  }

  for (const p of paths) {
    await ensureDocumentSlots(
      supabase,
      releaseStageForPath(p),
      file.loanApplicationId,
      app.borrower_id as string,
      checklistScope,
    );
  }
  await ensureDocumentSlots(
    supabase,
    "release",
    file.loanApplicationId,
    app.borrower_id as string,
    checklistScope,
  );

  await syncApplicationBlocker(supabase, file.loanApplicationId, nextStatus, {
    actorId,
  });

  const signingStages = paths.map((p) => releaseStageForPath(p));
  return {
    status: nextStatus,
    releasePaths: paths,
    signingStages,
  };
}

export async function getReleaseFile(
  supabase: SupabaseClient,
  releaseFileId: string,
) {
  const { data, error } = await supabase
    .from("release_files")
    .select("*")
    .eq("id", releaseFileId)
    .single();

  if (error || !data) {
    throw new Error("Release file not found");
  }

  return mapReleaseFileRow(data);
}

/**
 * Gross (pre-discount) basis for PDC amounts — must exactly mirror
 * `initializeArAccount`'s identical computation in ar/masterlist.ts. Every
 * PDC-amount generator below feeds this same gross basis into the exact
 * same schedule functions `initializeArAccount` calls at release, so a
 * check encoded here can never disagree with the row it will actually
 * settle. See docs/ledger-balance-consistency-fix-implementation-plan.md
 * Phase 1 (F10) — before this fix these generators read
 * computation.totalLoan/totalInterest/monthlyAmortization directly, which
 * are already net-of-discount, silently diluting the discount across every
 * PDC check instead of concentrating it on the CSA-selected installments.
 */
function grossPdcBasis(
  computation: NonNullable<Awaited<ReturnType<typeof getActiveComputation>>>,
): { grossTotalInterest: number; grossTotalLoan: number; grossMonthlyAmortization: number } {
  const grossTotalInterest = computation.grossTotalInterest;
  const grossTotalLoan = halfUp(computation.principal + grossTotalInterest);
  const grossMonthlyAmortization = halfUp(grossTotalLoan / computation.terms);
  return { grossTotalInterest, grossTotalLoan, grossMonthlyAmortization };
}

/**
 * Builds the expected {amount, date} PDC check schedule for the 5 schedule
 * types added after the original monthly/semi-monthly-only PDC logic
 * (Invoice/Bi-Monthly/Quarterly/Two-Monthly/Daily). Reuses the exact same
 * generators/engines `initializeArAccount` (ar/masterlist.ts) uses to build
 * the real AR masterlist schedule at release — so a CSA encoding PDC checks
 * before release can never produce a schedule that disagrees with what
 * actually gets billed after release. Monthly and semi-monthly (Salary) are
 * not handled here — they keep their own original, untouched logic inline
 * in `savePdcChecks` below.
 */
function buildExpectedPdcSchedule(
  computation: NonNullable<Awaited<ReturnType<typeof getActiveComputation>>>,
): Array<{ amount: number; date: string }> {
  if (computation.paymentFrequency === "daily") {
    // Single manually-dated payment — doesn't anchor off releaseDate at all,
    // just the CSA-entered firstPaymentDate (already validated above this
    // call) and the already-computed principal+interest total. Daily has
    // zero discount units (see masterlist.ts), so gross vs net is moot here
    // — matches initializeArAccount, which also reads computation.totalLoan
    // (net) for Daily specifically.
    return [{ amount: computation.totalLoan, date: computation.firstPaymentDate! }];
  }

  // Every other new schedule type anchors its due dates off releaseDate.
  if (!computation.releaseDate) {
    throw new ValidationError(
      "This application's computation has no release date recorded — recompute it before saving PDC checks.",
    );
  }
  const releaseDate = new Date(computation.releaseDate);

  if (computation.paymentFrequency === "weekly") {
    // Invoice's own real interest engine — principal/terms only, never reads
    // totalInterest/totalLoan, so gross vs net doesn't apply here either
    // (matches initializeArAccount exactly).
    const result = computeInvoiceLoan({
      principal: computation.principal,
      terms: computation.terms,
      releaseDate,
    });
    return invoiceScheduleToInstallments(result).map((row) => ({
      amount: row.amountDue,
      date: row.dueDate,
    }));
  }

  const { grossTotalInterest, grossTotalLoan, grossMonthlyAmortization } =
    grossPdcBasis(computation);

  if (computation.paymentFrequency === "bi_monthly") {
    return generateBiMonthlySchedule({
      terms: computation.terms,
      monthlyAmortization: grossMonthlyAmortization,
      releaseDate,
      totalLoan: grossTotalLoan,
    }).map((row) => ({ amount: row.amountDue, date: row.dueDate }));
  }

  if (computation.paymentFrequency === "quarterly") {
    return generateQuarterlySchedule({
      terms: computation.terms,
      totalLoan: grossTotalLoan,
      totalInterest: grossTotalInterest,
      releaseDate,
      dueDay: computation.dueDay ?? 10,
    }).map((row) => ({ amount: row.amountDue, date: row.dueDate }));
  }

  if (computation.paymentFrequency === "quarterly_special") {
    // Special mode's generator emits a $0 principal row alongside every
    // non-final period's interest row (kept that way so discount-units.ts's
    // interest/principal pairing stride stays intact — see
    // docs/quarterly-bimonthly-special-schedule-implementation-plan.md).
    // A physical PDC check for ₱0 makes no sense, so those rows are
    // dropped here — only real, positive-amount rows become expected checks.
    return generateQuarterlySpecialSchedule({
      terms: computation.terms,
      totalLoan: grossTotalLoan,
      totalInterest: grossTotalInterest,
      releaseDate,
      dueDay: computation.dueDay ?? 10,
    })
      .filter((row) => row.amountDue > 0)
      .map((row) => ({ amount: row.amountDue, date: row.dueDate }));
  }

  if (computation.paymentFrequency === "two_monthly_special") {
    // Same $0-row filtering as quarterly_special above.
    return generateTwoMonthlySpecialSchedule({
      terms: computation.terms,
      totalLoan: grossTotalLoan,
      totalInterest: grossTotalInterest,
      releaseDate,
      dueDay: computation.dueDay ?? 10,
    })
      .filter((row) => row.amountDue > 0)
      .map((row) => ({ amount: row.amountDue, date: row.dueDate }));
  }

  // two_monthly — the only remaining case among the schedule types handled here.
  return generateTwoMonthlySchedule({
    terms: computation.terms,
    totalLoan: grossTotalLoan,
    totalInterest: grossTotalInterest,
    releaseDate,
    dueDay: computation.dueDay ?? 10,
  }).map((row) => ({ amount: row.amountDue, date: row.dueDate }));
}

export async function savePdcChecks(
  supabase: SupabaseClient,
  releaseFileId: string,
  checks: Array<{
    checkNumber?: string | null;
    amount: number;
    checkDate: string;
    bankName: string;
    refAccount?: string | null;
  }>,
  blankRange?: { from?: string; to?: string },
  actorId?: string,
) {
  const file = await getReleaseFile(supabase, releaseFileId);

  if (!file.releasePaths.includes("with_pdc")) {
    throw new ValidationError("PDC encoding only applies to With PDC path");
  }

  const computation = await getActiveComputation(
    supabase,
    file.loanApplicationId,
  );
  if (!computation) {
    throw new Error("No active computation found for this application");
  }

  if (!computation.firstPaymentDate) {
    throw new ValidationError(
      "This application's computation has no payment start date recorded — recompute it before saving PDC checks.",
    );
  }

  // Salary loans (semi-monthly) need terms*2 checks, each half the monthly
  // amortization (last one absorbing rounding against totalLoan), on
  // alternating 15th/end-of-month dates. Seafarer/SME/MPL (the original
  // "everything else" cadence) is unchanged: `terms` checks, flat
  // monthlyAmortization, addScheduleMonths. Invoice/Bi-Monthly/Quarterly/
  // Two-Monthly/Daily each build a full expected schedule via
  // buildExpectedPdcSchedule instead — their count/amount/date shapes don't
  // fit the flat-monthly or halved-semi-monthly patterns at all.
  const isSemiMonthly = computation.paymentFrequency === "semi_monthly";
  const isNewScheduleType =
    computation.paymentFrequency === "weekly" ||
    computation.paymentFrequency === "bi_monthly" ||
    computation.paymentFrequency === "quarterly" ||
    computation.paymentFrequency === "two_monthly" ||
    computation.paymentFrequency === "daily" ||
    computation.paymentFrequency === "quarterly_special" ||
    computation.paymentFrequency === "two_monthly_special";
  const expectedSchedule = isNewScheduleType
    ? buildExpectedPdcSchedule(computation)
    : null;

  const expectedCount = expectedSchedule
    ? expectedSchedule.length
    : isSemiMonthly
      ? computation.terms * 2
      : computation.terms;

  if (checks.length !== expectedCount) {
    throw new ValidationError(
      expectedSchedule
        ? `Number of checks must equal ${expectedCount} for this loan's schedule`
        : `Number of checks must equal ${isSemiMonthly ? "twice the loan term" : "the loan term"} (${expectedCount})`,
    );
  }

  const normalizedChecks = checks.map((row) => {
    const checkNumber = row.checkNumber?.trim();
    if (!checkNumber) {
      throw new ValidationError("Check number is required for every PDC");
    }
    const bankName = row.bankName.trim();
    if (!bankName) {
      throw new ValidationError("Bank/Branch is required for every PDC");
    }
    return { ...row, checkNumber, bankName };
  });

  // Same gross basis as buildExpectedPdcSchedule / initializeArAccount — a
  // discounted Salary/Seafarer/SME/MPL loan's PDC amounts must match the
  // real per-row amount generateAmortizationSchedule will produce, not the
  // net-of-discount computation.monthlyAmortization/totalLoan (F10 fix, see
  // docs/ledger-balance-consistency-fix-implementation-plan.md Phase 1).
  const { grossTotalLoan, grossMonthlyAmortization } = grossPdcBasis(computation);
  const halfAmortization = halfUp(grossMonthlyAmortization / 2);
  const lastSemiMonthlyAmount = halfUp(
    grossTotalLoan - halfUp(halfAmortization * (expectedCount - 1)),
  );

  if (expectedSchedule) {
    normalizedChecks.forEach((row, index) => {
      const expectedAmount = expectedSchedule[index].amount;
      if (row.amount !== expectedAmount) {
        throw new ValidationError(
          `Check amount must equal ₱${expectedAmount} for PDC #${index + 1}`,
        );
      }
    });
  } else if (isSemiMonthly) {
    normalizedChecks.forEach((row, index) => {
      const expectedAmount =
        index === expectedCount - 1
          ? lastSemiMonthlyAmount > 0
            ? lastSemiMonthlyAmount
            : halfAmortization
          : halfAmortization;
      if (row.amount !== expectedAmount) {
        throw new ValidationError(
          `Check amount must equal ₱${expectedAmount} for PDC #${index + 1}`,
        );
      }
    });
  } else {
    // Flat monthly cadence (Seafarer/SME/MPL) — now gross-basis (see above).
    for (const row of normalizedChecks) {
      if (row.amount !== grossMonthlyAmortization) {
        throw new ValidationError(
          `Check amount must equal the monthly amortization (₱${grossMonthlyAmortization})`,
        );
      }
    }
  }

  normalizedChecks.forEach((row, index) => {
    const expectedDate = expectedSchedule
      ? expectedSchedule[index].date
      : isSemiMonthly
        ? advanceSemiMonthly(computation.firstPaymentDate!, index)
        : addScheduleMonths(computation.firstPaymentDate!, index);
    if (row.checkDate !== expectedDate) {
      throw new ValidationError(
        `PDC #${index + 1} date must be ${expectedDate} (got ${row.checkDate}) — dates must follow the computed payment schedule`,
      );
    }
  });

  await supabase.from("pdc_checks").delete().eq("release_file_id", releaseFileId);

  if (checks.length > 0) {
    const { error: insertError } = await supabase.from("pdc_checks").insert(
      normalizedChecks.map((row, index) => ({
        release_file_id: releaseFileId,
        check_number: row.checkNumber,
        amount: row.amount,
        check_date: row.checkDate,
        bank_name: row.bankName,
        ref_account: row.refAccount ?? null,
        sort_order: index,
      })),
    );

    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  const { error } = await supabase
    .from("release_files")
    .update({
      status: "ready_generate",
      blank_check_from: blankRange?.from ?? null,
      blank_check_to: blankRange?.to ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", releaseFileId);

  if (error) {
    throw new Error(error.message);
  }

  await syncApplicationBlocker(
    supabase,
    file.loanApplicationId,
    "ready_generate",
    { actorId },
  );

  return {
    status: "ready_generate" as const,
    checkCount: checks.length,
    terms: computation.terms,
  };
}

function releasePathsFromRow(row: Record<string, unknown>): ReleasePath[] {
  const paths = row.release_paths;
  if (!Array.isArray(paths) || paths.length === 0) return [];
  return [
    ...new Set(
      paths.filter(
        (p): p is ReleasePath => p === "with_pdc" || p === "without_pdc",
      ),
    ),
  ];
}

type ReleaseGenerationContext = {
  file: ReturnType<typeof mapReleaseFileRow>;
  releasePaths: ReleasePath[];
  segment: "seafarer" | "sme" | "individual";
  collateralType: CollateralType;
  borrowerId: string;
  catalog: ReleaseTemplateRow[];
  contextByPath: Map<ReleasePath, ReturnType<typeof buildReleaseTemplateContext>>;
};

/**
 * The `category = 'release'` template catalog with per-segment eligibility and
 * published-version status — the input to `releaseDocumentCandidates` /
 * `autoGenerateSlugs`. Used by the generation entry points and the LRA
 * workspace API (document picker).
 */
export async function loadReleaseTemplateCatalog(
  supabase: SupabaseClient,
): Promise<ReleaseTemplateRow[]> {
  const { data: templateRows } = await supabase
    .from("document_templates")
    .select("id, slug, name, seafarer_generation, sme_generation")
    .eq("category", "release");
  const { data: publishedRows } = await supabase
    .from("document_template_versions")
    .select("template_id, version_no")
    .eq("status", "published");

  const publishedByTemplate = new Map<string, number>();
  for (const r of (publishedRows ?? []) as Array<{
    template_id: string;
    version_no: number;
  }>) {
    publishedByTemplate.set(r.template_id, r.version_no);
  }

  return (
    (templateRows ?? []) as Array<{
      id: string;
      slug: string;
      name: string;
      seafarer_generation: ReleaseTemplateRow["seafarerGeneration"];
      sme_generation: ReleaseTemplateRow["smeGeneration"];
    }>
  ).map((r) => ({
    slug: r.slug,
    name: r.name,
    publishedVersionNo: publishedByTemplate.get(r.id) ?? null,
    seafarerGeneration: r.seafarer_generation,
    smeGeneration: r.sme_generation,
  }));
}

/**
 * Shared setup for both generation entry points: validates the release file,
 * loads the computation + BLRI + per-path merge context, and the
 * `category = 'release'` template catalog with its per-segment eligibility and
 * published-version status. Hard-errors are identical to the pre-refactor
 * `generateReleaseDocuments`.
 */
async function loadReleaseGenerationContext(
  supabase: SupabaseClient,
  releaseFileId: string,
): Promise<ReleaseGenerationContext> {
  const { data: row, error: rowError } = await supabase
    .from("release_files")
    .select("*")
    .eq("id", releaseFileId)
    .single();

  if (rowError || !row) {
    throw new Error("Release file not found");
  }

  const file = mapReleaseFileRow(row);
  const releasePaths = releasePathsFromRow(row);

  if (releasePaths.length === 0) {
    throw new ValidationError("Release path must be selected first");
  }

  if (!["ready_generate", "awaiting_signatures"].includes(file.status)) {
    throw new ValidationError("Documents cannot be generated at this stage");
  }

  const computation = await getActiveComputation(supabase, file.loanApplicationId);
  if (!computation) {
    throw new Error("Computation not found");
  }

  const blri = await loadBlriContext(
    supabase,
    file.loanApplicationId,
    releaseFileId,
  );

  const { data: app } = await supabase
    .from("loan_applications")
    .select("borrower_id, segment, collateral_type, borrowers (*)")
    .eq("id", file.loanApplicationId)
    .single();

  if (!app?.borrower_id) {
    throw new Error("Borrower not found");
  }

  const collateralType = app.collateral_type as CollateralType;
  const segment = (app.segment === "sme" || app.segment === "individual"
    ? app.segment
    : "seafarer") as "seafarer" | "sme" | "individual";

  const catalog = await loadReleaseTemplateCatalog(supabase);

  // One merge context per selected path — voucher pairs need path-specific
  // disbursement fields; shared slugs are path-independent.
  const borrowerRaw = app.borrowers;
  const borrowerProfile = mapBorrowerRow(
    (Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw) as BorrowerRow,
  );
  // Audit fix: resolve the real "who computed / who signed" actors on this
  // computation to display names, once, for every path's context — reuses
  // the same profiles lookup the AR module already uses for its history log.
  const performerIds = [computation.computedBy, computation.signedBy].filter(
    (id): id is string => Boolean(id),
  );
  const performerNames = await resolvePerformerNames(supabase, performerIds);

  // The CI inspection's vehicles/properties (see collateral-context.ts) —
  // one document table row per collateral item, replacing the previous
  // hardcoded empty vehicles[]/properties[] on every chattel/REM document.
  const collateral = await loadCollateralDocumentContext(
    supabase,
    file.loanApplicationId,
  );

  const computationInput = {
    netReleased: computation.netReleased,
    releaseDate: computation.releaseDate,
    addonMonths: computation.addonMonths,
    interestRate: computation.interestRate,
    loanTypeName: computation.loanTypeName,
    processingFee: computation.processingFee,
    securityFee: computation.securityFee,
    docStamp: computation.docStamp,
    adminCost: computation.adminCost,
    notaryFee: computation.notaryFee,
    preparedByName: computation.computedBy
      ? (performerNames.get(computation.computedBy) ?? "")
      : "",
    approvedByName: computation.signedBy
      ? (performerNames.get(computation.signedBy) ?? "")
      : "",
  };
  const segmentScope = { segment };
  const contextByPath = new Map(
    releasePaths.map((p) => [
      p,
      buildReleaseTemplateContext(
        blri,
        computationInput,
        borrowerProfile,
        p,
        segmentScope,
        collateral,
      ),
    ]),
  );

  return {
    file,
    releasePaths,
    segment,
    collateralType,
    borrowerId: app.borrower_id as string,
    catalog,
    contextByPath,
  };
}

/**
 * Render + store one release document. This is the pre-refactor per-slug loop
 * body, unchanged, plus a `regenerated` flag and a `witnessed_by` reset so a
 * regenerate clears any prior signature. The `contextPath` decision now reads
 * `PATH_SPECIFIC_SLUGS` instead of the retired `AUTO_GENERATED_SLUGS`.
 */
async function generateOneReleaseDocument(
  supabase: SupabaseClient,
  releaseFileId: string,
  slug: string,
  contextByPath: Map<ReleasePath, ReturnType<typeof buildReleaseTemplateContext>>,
  releasePaths: ReleasePath[],
  borrowerId: string,
  renderConfig: ResolvedDocRenderConfig,
): Promise<{ slug: string; contentHash: string; regenerated: boolean }> {
  // All release documents render from published templates (the legacy hardcoded
  // renderer was retired in Phase 7). A missing published template is a hard
  // error — every release slug is seeded + published.
  const published = await getPublishedTemplate(supabase, slug);
  if (!published) {
    throw new Error(
      `No published template for release document "${slug}" — cannot generate.`,
    );
  }

  const onlyWithPdc = PATH_SPECIFIC_SLUGS.with_pdc.includes(slug);
  const onlyWithoutPdc = PATH_SPECIFIC_SLUGS.without_pdc.includes(slug);
  const contextPath: ReleasePath = onlyWithPdc
    ? "with_pdc"
    : onlyWithoutPdc
      ? "without_pdc"
      : releasePaths[0];
  const templateContext = contextByPath.get(contextPath);
  if (!templateContext) {
    throw new Error(`Missing template context for path "${contextPath}"`);
  }

  const { data: existing } = await supabase
    .from("generated_documents")
    .select("id")
    .eq("release_file_id", releaseFileId)
    .eq("document_slug", slug)
    .maybeSingle();

  const pdf = await renderTemplateToPdf(published.body, templateContext, {
    engine: renderConfig.engine,
    connection: renderConfig.connection,
  });
  const templateVersionId = published.versionId;

  const contentHash = hashPdf(pdf);
  const docId = crypto.randomUUID();
  const storagePath = `${borrowerId}/release/${releaseFileId}/${slug}-${docId}.pdf`;

  await uploadDocumentBytes(supabase, storagePath, pdf, "application/pdf");

  await supabase.from("generated_documents").upsert(
    {
      release_file_id: releaseFileId,
      document_slug: slug,
      storage_path: storagePath,
      content_hash: contentHash,
      template_version_id: templateVersionId,
      is_finalized: false,
      signed_at: null,
      signed_by: null,
      witnessed_by: null,
      signature_hash: null,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "release_file_id,document_slug" },
  );

  return { slug, contentHash, regenerated: Boolean(existing) };
}

/**
 * Post-generation transition — move the file into signing, seed the briefing
 * checklist, sync the application blocker. Runs once (on the first generated
 * document), never on a regenerate of an already-signing file.
 */
async function finalizeGenerationTransition(
  supabase: SupabaseClient,
  releaseFileId: string,
  loanApplicationId: string,
  actorId: string,
) {
  await supabase
    .from("release_files")
    .update({
      status: "awaiting_signatures",
      updated_at: new Date().toISOString(),
    })
    .eq("id", releaseFileId);

  await supabase.from("briefings").upsert(
    {
      release_file_id: releaseFileId,
      checklist: [
        { key: "terms_reviewed", label: "Loan terms reviewed with borrower" },
        { key: "obligations_explained", label: "Payment obligations explained" },
        { key: "contact_info", label: "Collection contact information provided" },
      ],
    },
    { onConflict: "release_file_id" },
  );

  await syncApplicationBlocker(
    supabase,
    loanApplicationId,
    "awaiting_signatures",
    { actorId },
  );
}

/**
 * "Generate all" — produces every `always`-eligible, publishable, condition-
 * matched release document for the loan. For a seafarer loan this reproduces
 * the old `AUTO_GENERATED_SLUGS[path]` (+ collateral) set exactly. Called by the
 * generate endpoint when no specific `slug` is requested.
 */
export async function generateReleaseDocuments(
  supabase: SupabaseClient,
  releaseFileId: string,
  actorId: string,
) {
  const ctx = await loadReleaseGenerationContext(supabase, releaseFileId);
  const renderConfig = await loadDocRenderConfig();

  const slugs = autoGenerateSlugs(
    segmentGroup(ctx.segment),
    ctx.catalog,
    ctx.releasePaths,
    ctx.collateralType,
  );

  for (const slug of slugs) {
    await generateOneReleaseDocument(
      supabase,
      releaseFileId,
      slug,
      ctx.contextByPath,
      ctx.releasePaths,
      ctx.borrowerId,
      renderConfig,
    );
  }

  await finalizeGenerationTransition(
    supabase,
    releaseFileId,
    ctx.file.loanApplicationId,
    actorId,
  );

  return { status: "awaiting_signatures" as const, slugs };
}

/**
 * Generate (or regenerate) one release document the LRA officer picked from the
 * modal. The slug must be a non-hidden, condition-matched, publishable candidate
 * for this loan. The first generated document moves the file into signing.
 */
export async function generateReleaseDocumentBySlug(
  supabase: SupabaseClient,
  releaseFileId: string,
  slug: string,
  actorId: string,
): Promise<{
  slug: string;
  status: ReleaseFileStatus;
  regenerated: boolean;
}> {
  const ctx = await loadReleaseGenerationContext(supabase, releaseFileId);

  const allowed = releaseDocumentCandidates(
    segmentGroup(ctx.segment),
    ctx.catalog,
    ctx.releasePaths,
    ctx.collateralType,
  ).some((c) => c.slug === slug && c.canGenerate);
  if (!allowed) {
    throw new ValidationError(
      `"${slug}" is not an available release document for this loan`,
    );
  }

  const { regenerated } = await generateOneReleaseDocument(
    supabase,
    releaseFileId,
    slug,
    ctx.contextByPath,
    ctx.releasePaths,
    ctx.borrowerId,
    await loadDocRenderConfig(),
  );

  const wasReadyGenerate = ctx.file.status === "ready_generate";
  if (wasReadyGenerate) {
    await finalizeGenerationTransition(
      supabase,
      releaseFileId,
      ctx.file.loanApplicationId,
      actorId,
    );
  }

  return {
    slug,
    status: wasReadyGenerate ? "awaiting_signatures" : ctx.file.status,
    regenerated,
  };
}

/** Release-file statuses where generated documents may still be added/removed. */
const GENERATED_DOC_MODIFIABLE_STATUSES: ReleaseFileStatus[] = [
  "ready_generate",
  "awaiting_signatures",
];

/**
 * Pure guard — may a generated document be regenerated or removed right now?
 * Blocked once it is finalized (release closed) or the briefing is acknowledged,
 * or the file has moved past signing.
 */
export function canModifyGeneratedDoc(
  status: ReleaseFileStatus,
  isFinalized: boolean,
  briefingAcknowledged: boolean,
): boolean {
  if (isFinalized) return false;
  if (briefingAcknowledged) return false;
  return GENERATED_DOC_MODIFIABLE_STATUSES.includes(status);
}

/**
 * Pure — the release-file status after removing a generated document, or `null`
 * when it should not change. Mirrors the sign path so the file can't get stuck:
 * last doc removed rolls back to `ready_generate`; if every remaining doc is
 * signed it advances to `awaiting_briefing` (what the final sign would have done).
 */
export function releaseTransitionAfterDelete(
  status: ReleaseFileStatus,
  remainingCount: number,
  allRemainingSigned: boolean,
): ReleaseFileStatus | null {
  if (status !== "awaiting_signatures") return null;
  if (remainingCount === 0) return "ready_generate";
  if (allRemainingSigned) return "awaiting_briefing";
  return null;
}

/**
 * Remove one generated document (and its stored PDF), then apply the post-delete
 * status transition. Refuses once the document is finalized, the briefing is
 * acknowledged, or the file has moved past signing.
 */
export async function removeGeneratedDocument(
  supabase: SupabaseClient,
  releaseFileId: string,
  documentId: string,
  actorId: string,
) {
  const { data: doc, error } = await supabase
    .from("generated_documents")
    .select(
      "id, storage_path, is_finalized, release_files ( id, loan_application_id, status )",
    )
    .eq("id", documentId)
    .single();

  if (error || !doc) {
    throw new ValidationError("Generated document not found");
  }

  const rfRaw = doc.release_files;
  const rf = Array.isArray(rfRaw) ? rfRaw[0] : rfRaw;
  if (!rf || rf.id !== releaseFileId) {
    throw new ValidationError("Generated document not found");
  }

  const { data: briefing } = await supabase
    .from("briefings")
    .select("acknowledged_at")
    .eq("release_file_id", releaseFileId)
    .maybeSingle();

  if (
    !canModifyGeneratedDoc(
      rf.status as ReleaseFileStatus,
      Boolean(doc.is_finalized),
      Boolean(briefing?.acknowledged_at),
    )
  ) {
    throw new ValidationError(
      "This document can no longer be removed at this stage",
    );
  }

  // Storage cleanup is best-effort — a stray object must not block the removal.
  if (doc.storage_path) {
    try {
      await supabase.storage
        .from(DOCUMENT_BUCKET)
        .remove([doc.storage_path as string]);
    } catch {
      // ignore
    }
  }

  const { data: deleted, error: delError } = await supabase
    .from("generated_documents")
    .delete()
    .eq("id", documentId)
    .select("id");

  if (delError) {
    throw new Error(delError.message);
  }
  if (!deleted || deleted.length === 0) {
    throw new Error(
      "Delete affected no rows — check the generated_documents DELETE policy",
    );
  }

  const { data: remaining } = await supabase
    .from("generated_documents")
    .select("id, signed_at")
    .eq("release_file_id", releaseFileId);
  const remainingCount = remaining?.length ?? 0;
  const allRemainingSigned =
    remainingCount > 0 && (remaining ?? []).every((d) => d.signed_at);

  const next = releaseTransitionAfterDelete(
    rf.status as ReleaseFileStatus,
    remainingCount,
    allRemainingSigned,
  );

  if (next && next !== rf.status) {
    await supabase
      .from("release_files")
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq("id", releaseFileId);

    await syncApplicationBlocker(
      supabase,
      rf.loan_application_id as string,
      next,
      next === "awaiting_briefing"
        ? { actorId, applicationStatus: "release_briefing" }
        : { actorId },
    );
  }

  return {
    removed: true as const,
    status: next ?? (rf.status as ReleaseFileStatus),
    remainingCount,
  };
}

export async function witnessSignGeneratedDocument(
  supabase: SupabaseClient,
  documentId: string,
  witnessedById: string,
) {
  const { data: doc, error } = await supabase
    .from("generated_documents")
    .select("*, release_files ( loan_application_id, status )")
    .eq("id", documentId)
    .single();

  if (error || !doc || doc.is_finalized) {
    throw new ValidationError("Document not available for signing");
  }

  if (doc.signed_at) {
    throw new ValidationError("Document already signed");
  }

  const releaseFileRaw = doc.release_files;
  const releaseFile = Array.isArray(releaseFileRaw)
    ? releaseFileRaw[0]
    : releaseFileRaw;

  if (releaseFile?.status !== "awaiting_signatures") {
    throw new ValidationError("Release file is not in the signing stage");
  }

  // signed_by stays the borrower — it's their signature on the paper; the LRA
  // staffer who ran the in-branch session is recorded as witnessed_by.
  const { data: app } = await supabase
    .from("loan_applications")
    .select("borrowers ( user_id )")
    .eq("id", releaseFile.loan_application_id as string)
    .single();

  const borrowerRaw = app?.borrowers;
  const borrower = Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw;

  const signedAt = new Date().toISOString();
  const signatureHash = doc.content_hash as string;

  const { error: updateError } = await supabase
    .from("generated_documents")
    .update({
      signed_at: signedAt,
      signed_by: (borrower?.user_id as string | null) ?? null,
      witnessed_by: witnessedById,
      signature_hash: signatureHash,
    })
    .eq("id", documentId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const { data: allDocs } = await supabase
    .from("generated_documents")
    .select("id, signed_at")
    .eq("release_file_id", doc.release_file_id);

  const allSigned = (allDocs ?? []).every((d) => d.signed_at);

  if (allSigned) {
    const admin = createServiceClient();
    await admin
      .from("release_files")
      .update({
        status: "awaiting_briefing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", doc.release_file_id);

    await syncApplicationBlocker(
      admin,
      releaseFile.loan_application_id as string,
      "awaiting_briefing",
      { actorId: witnessedById, applicationStatus: "release_briefing" },
    );
  }

  return { signedAt, allSigned };
}

export async function witnessSignAllGeneratedDocuments(
  supabase: SupabaseClient,
  applicationId: string,
  witnessedById: string,
) {
  const { data: releaseFile } = await supabase
    .from("release_files")
    .select("id, loan_application_id, status")
    .eq("loan_application_id", applicationId)
    .maybeSingle();

  if (!releaseFile || releaseFile.status !== "awaiting_signatures") {
    throw new ValidationError("Release file is not in the signing stage");
  }

  const { data: docs } = await supabase
    .from("generated_documents")
    .select("id, signed_at, is_finalized")
    .eq("release_file_id", releaseFile.id);

  const ids = unsignedGeneratedDocumentIds(docs ?? []);
  if (ids.length === 0) {
    throw new ValidationError("No unsigned documents");
  }

  let lastResult = { allSigned: false };
  for (const id of ids) {
    lastResult = await witnessSignGeneratedDocument(
      supabase,
      id,
      witnessedById,
    );
  }

  return { signedCount: ids.length, allSigned: lastResult.allSigned };
}

export async function unwitnessSignGeneratedDocument(
  supabase: SupabaseClient,
  documentId: string,
  actorId: string,
) {
  const { data: doc, error } = await supabase
    .from("generated_documents")
    .select("*, release_files ( loan_application_id, status )")
    .eq("id", documentId)
    .single();

  if (error || !doc) {
    throw new Error("Document not found");
  }

  if (!doc.signed_at) {
    throw new ValidationError("Document is not signed");
  }

  if (doc.is_finalized) {
    throw new ValidationError("Document not available for unsigning");
  }

  const releaseFileRaw = doc.release_files;
  const releaseFile = Array.isArray(releaseFileRaw)
    ? releaseFileRaw[0]
    : releaseFileRaw;

  let rolledBackToSigning = false;

  if (releaseFile?.status === "awaiting_signatures") {
    // No rollback needed.
  } else if (releaseFile?.status === "awaiting_briefing") {
    const { data: briefing } = await supabase
      .from("briefings")
      .select("acknowledged_at")
      .eq("release_file_id", doc.release_file_id)
      .maybeSingle();

    if (briefing?.acknowledged_at) {
      throw new ValidationError(
        "Briefing has already been acknowledged — signature can no longer be undone",
      );
    }

    rolledBackToSigning = true;
  } else {
    throw new ValidationError(
      "Release file has moved past the signing stage — signature can no longer be undone",
    );
  }

  const { error: updateError } = await supabase
    .from("generated_documents")
    .update({
      signed_at: null,
      signed_by: null,
      witnessed_by: null,
      signature_hash: null,
    })
    .eq("id", documentId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  if (rolledBackToSigning) {
    const admin = createServiceClient();
    await admin
      .from("release_files")
      .update({
        status: "awaiting_signatures",
        updated_at: new Date().toISOString(),
      })
      .eq("id", doc.release_file_id);

    await syncApplicationBlocker(
      admin,
      releaseFile.loan_application_id as string,
      "awaiting_signatures",
      { actorId, applicationStatus: "release_signing" },
    );
  }

  return { unsigned: true, rolledBackToSigning };
}

export async function acknowledgeBriefing(
  supabase: SupabaseClient,
  releaseFileId: string,
  collectorUserId: string,
) {
  const file = await getReleaseFile(supabase, releaseFileId);

  if (file.status !== "awaiting_briefing" && file.status !== "ready_release") {
    throw new ValidationError("Briefing not pending");
  }

  const { data: briefing, error: briefingError } = await supabase
    .from("briefings")
    .select("id, acknowledged_at, checklist")
    .eq("release_file_id", releaseFileId)
    .single();

  if (briefingError || !briefing) {
    throw new Error("Briefing record not found");
  }

  const now = new Date().toISOString();
  const alreadySigned = Boolean(briefing.acknowledged_at);

  // Collector may update briefings (briefings_collector_ack). Skip if already acked.
  if (!alreadySigned) {
    if (file.status !== "awaiting_briefing") {
      throw new ValidationError("Briefing not pending");
    }

    const checklist = Array.isArray(briefing.checklist)
      ? (briefing.checklist as Array<{ key: string; label: string }>).map(
          (item) => ({ ...item, signedAt: now }),
        )
      : [];

    const { error: signError } = await supabase
      .from("briefings")
      .update({
        acknowledged_at: now,
        acknowledged_by: collectorUserId,
        checklist,
      })
      .eq("release_file_id", releaseFileId);

    if (signError) {
      throw new Error(signError.message);
    }
  }

  // Privileged side-effects: collectors cannot UPDATE release_files or advance
  // application status under RLS (release_files_write is LRA-only). Same pattern
  // as queueForLra / discloseTerms — permission already verified by the caller.
  const admin = createServiceClient();
  const signedAt = (briefing.acknowledged_at as string | null) ?? now;

  if (file.status !== "ready_release") {
    const { error: fileError } = await admin
      .from("release_files")
      .update({
        status: "ready_release",
        updated_at: now,
      })
      .eq("id", releaseFileId);

    if (fileError) {
      throw new Error(fileError.message);
    }

    const hasContract = await hasEmploymentContractUploaded(
      admin,
      file.loanApplicationId,
    );
    const blocker = releaseBlockerForReadyRelease(
      file.releasePaths as ReleasePath[],
      hasContract,
    );

    await syncApplicationBlocker(
      admin,
      file.loanApplicationId,
      "ready_release",
      { actorId: collectorUserId, applicationStatus: "release_ready" },
    );

    const { error: blockerError } = await admin
      .from("loan_applications")
      .update({ blocker })
      .eq("id", file.loanApplicationId);

    if (blockerError) {
      throw new Error(blockerError.message);
    }
  }

  return { status: "ready_release" as const, signedAt };
}

/**
 * Signed-scan document slugs that must be uploaded on the release checklist
 * before a release can close. The Promissory Note (notarized) and Disclosure
 * Statement follow generate -> wet-sign/notarize -> scan-back-in, same as the
 * signed check voucher.
 */
export const REQUIRED_SIGNED_RELEASE_SLUGS = [
  "signed_check_voucher",
  "signed_promissory_note",
  "signed_disclosure_statement",
] as const;

const SIGNED_SLUG_LABEL: Record<string, string> = {
  signed_check_voucher: "signed check voucher",
  signed_promissory_note: "signed/notarized promissory note",
  signed_disclosure_statement: "signed disclosure statement",
};

/** Required signed slugs not present in `present` (pure — for close gating). */
export function missingSignedReleaseSlugs(present: Iterable<string>): string[] {
  const set = new Set(present);
  return REQUIRED_SIGNED_RELEASE_SLUGS.filter((slug) => !set.has(slug));
}

/** Human labels for a set of signed slugs. */
export function signedReleaseSlugLabels(slugs: readonly string[]): string[] {
  return slugs.map((slug) => SIGNED_SLUG_LABEL[slug] ?? slug);
}

/**
 * Map each uploaded/confirmed release-stage signed scan to its document id.
 * Latest upload per slug wins.
 */
export async function resolveSignedReleaseDocuments(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("documents")
    .select("id, document_types!inner ( slug )")
    .eq("loan_application_id", applicationId)
    .eq("stage", "release")
    .in("status", ["uploaded", "confirmed"])
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const bySlug = new Map<string, string>();
  for (const row of data ?? []) {
    const docType = Array.isArray(row.document_types)
      ? row.document_types[0]
      : row.document_types;
    const slug = docType?.slug as string | undefined;
    if (slug && !bySlug.has(slug)) {
      bySlug.set(slug, row.id as string);
    }
  }
  return bySlug;
}

export async function resolveSignedVoucherDocumentId(
  supabase: SupabaseClient,
  applicationId: string,
) {
  const bySlug = await resolveSignedReleaseDocuments(supabase, applicationId);
  return bySlug.get("signed_check_voucher") ?? null;
}

export async function recordRelease(
  supabase: SupabaseClient,
  releaseFileId: string,
  actorId: string,
  notes?: string,
) {
  const { data: row, error: rowError } = await supabase
    .from("release_files")
    .select("*")
    .eq("id", releaseFileId)
    .single();

  if (rowError || !row) {
    throw new Error("Release file not found");
  }

  const file = mapReleaseFileRow(row);
  const releasePaths = releasePathsFromRow(row);

  const hasContract = await hasEmploymentContractUploaded(
    supabase,
    file.loanApplicationId,
  );
  assertEmploymentContractForRelease(hasContract);

  const { data: briefing } = await supabase
    .from("briefings")
    .select("acknowledged_at")
    .eq("release_file_id", releaseFileId)
    .maybeSingle();

  if (!canRecordRelease(file.status, briefing?.acknowledged_at as string | null)) {
    throw new ValidationError(
      "Briefing must be signed by the borrower before release",
    );
  }

  const eventType =
    file.releasePaths.includes("with_pdc") ||
    !file.releasePaths.includes("without_pdc")
      ? "check_released"
      : "cash_released";

  await supabase.from("release_events").insert({
    release_file_id: releaseFileId,
    event_type: eventType,
    notes: notes ?? null,
    acted_by: actorId,
  });

  await supabase
    .from("release_files")
    .update({
      status: "released",
      updated_at: new Date().toISOString(),
    })
    .eq("id", releaseFileId);

  // Overwrite the CSA-time estimate with the actual release day — service
  // role since the computation is already signed by this point, and CSA's
  // own RLS cannot update a signed row (see persistComputation's identical
  // deactivate-prior-actives comment).
  //
  // EXCEPTION — Daily Interest: the CSA-entered release date is the accrual
  // basis the borrower signed (interest = principal × rate ÷ days-in-release-
  // month × (paymentDate − releaseDate), matching the SME calculator).
  // Overwriting it here would silently change the signed figure's basis
  // without recomputing it, so daily loans keep the entered date. A released
  // daily loan therefore reports under its planned month, not the actual
  // disbursement day (accepted — see task-03-daily-interest-FINAL-plan.md).
  const admin = createServiceClient();
  const { data: compRow } = await admin
    .from("computations")
    .select("payment_frequency")
    .eq("id", file.computationId)
    .maybeSingle();
  if (compRow?.payment_frequency !== "daily") {
    await admin
      .from("computations")
      .update({ release_date: new Date().toISOString().slice(0, 10) })
      .eq("id", file.computationId);
  }

  await syncApplicationBlocker(supabase, file.loanApplicationId, "released", {
    actorId,
    applicationStatus: "released",
  });

  // Prefer a close-stage pending message when with_pdc physical collection
  // is still outstanding — does not touch earlier briefing/contract blockers.
  const collectBlocker = maybePdcCollectBlocker({
    releasePaths,
    status: "released",
    pdcCollectedAt: file.pdcCollectedAt,
  });
  if (collectBlocker) {
    await supabase
      .from("loan_applications")
      .update({ blocker: collectBlocker })
      .eq("id", file.loanApplicationId);
  }

  return { status: "released" as const };
}

/**
 * Creates a pending `internal_transfers` row for every Other Loan/Offset
 * deduction on the released loan that names a target account — the actual
 * balance reduction happens later when AR reviews and confirms it (never
 * automatic, never through the payments/DCR pipeline — see the plan doc for
 * why). Never throws: a bookkeeping side-effect must not block the release
 * that already succeeded; an unresolved account number is logged, not fatal.
 */
export async function createPendingInternalTransfers(
  admin: SupabaseClient,
  loanApplicationId: string,
  sourceMasterlistId: string,
  actorId: string,
) {
  try {
    // Idempotency: closeRelease has a retry path for a failed AR enroll,
    // which would otherwise call this again and double-create transfers for
    // the same release.
    const { data: existing } = await admin
      .from("internal_transfers")
      .select("id")
      .eq("source_loan_application_id", loanApplicationId)
      .limit(1);
    if (existing && existing.length > 0) return;

    const computation = await getActiveComputation(admin, loanApplicationId);
    const targets = extractDeductionTargets(computation?.otherDeductions);
    if (targets.length === 0) return;

    for (const target of targets) {
      const { data: targetAccount } = await admin
        .from("masterlist")
        .select("id")
        .eq("loan_account_no", target.accountNo)
        .maybeSingle();

      if (!targetAccount) {
        await writeAuditEvent({
          actorId,
          moduleSlug: "release_lra",
          action: "execute_trigger",
          entityType: "internal_transfer",
          entityId: loanApplicationId,
          afterData: {
            trigger: "internal_transfer_unresolved_account",
            accountNo: target.accountNo,
            amount: target.amount,
          },
        });
        continue;
      }

      await admin.from("internal_transfers").insert({
        source_loan_application_id: loanApplicationId,
        source_masterlist_id: sourceMasterlistId,
        target_masterlist_id: targetAccount.id,
        transfer_type: target.transferType,
        months: target.months,
        amount: target.amount,
        created_by: actorId,
        // Early-settlement discount (Phase 5/6) — carried onto the transfer
        // row so post_internal_transfer can apply it atomically at posting
        // time; a rejected transfer never touches the schedule rows at all.
        ...(target.discountAmount
          ? {
              discount_amount: target.discountAmount,
              discounted_installment_nos: target.discountedInstallmentNos ?? [],
            }
          : {}),
      });
    }
  } catch (err) {
    await writeAuditEvent({
      actorId,
      moduleSlug: "release_lra",
      action: "execute_trigger",
      entityType: "internal_transfer",
      entityId: loanApplicationId,
      afterData: {
        trigger: "internal_transfer_creation_failed",
        error: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

export async function closeRelease(
  supabase: SupabaseClient,
  releaseFileId: string,
  actorId: string,
  signedVoucherDocumentId?: string,
) {
  const { data: row, error: rowError } = await supabase
    .from("release_files")
    .select("*")
    .eq("id", releaseFileId)
    .single();

  if (rowError || !row) {
    throw new Error("Release file not found");
  }

  const file = mapReleaseFileRow(row);

  // Retry path: close already committed but masterlist enroll failed.
  if (file.status === "closed") {
    const admin = createServiceClient();
    const ar = await initializeArAccount(
      admin,
      file.loanApplicationId,
      releaseFileId,
      actorId,
    );
    await createPendingInternalTransfers(
      admin,
      file.loanApplicationId,
      ar.masterlistId,
      actorId,
    );
    return {
      status: "closed" as const,
      masterlistId: ar.masterlistId,
      created: ar.created,
    };
  }

  if (file.status !== "released") {
    throw new ValidationError("Release must be recorded before closure");
  }

  assertPdcCollectedForClose({
    releasePaths: releasePathsFromRow(row),
    pdcCollectedAt: file.pdcCollectedAt,
  });

  // Every signed scan must be back in before closing. The signed check voucher
  // may be passed explicitly (back-compat); the rest resolve from the release
  // checklist. The notarized PN especially cannot be skipped.
  const signedDocs = await resolveSignedReleaseDocuments(
    supabase,
    file.loanApplicationId,
  );
  if (signedVoucherDocumentId) {
    signedDocs.set("signed_check_voucher", signedVoucherDocumentId);
  }

  const missing = missingSignedReleaseSlugs(signedDocs.keys());
  if (missing.length > 0) {
    const labels = signedReleaseSlugLabels(missing);
    throw new ValidationError(
      `Upload the following signed scan(s) on the release checklist before closing: ${labels.join(", ")}`,
    );
  }

  const voucherId = signedDocs.get("signed_check_voucher") as string;

  await supabase.from("release_events").insert({
    release_file_id: releaseFileId,
    event_type: "transmitted",
    signed_voucher_document_id: voucherId,
    acted_by: actorId,
  });

  await supabase.from("release_events").insert({
    release_file_id: releaseFileId,
    event_type: "closed",
    acted_by: actorId,
  });

  const now = new Date().toISOString();

  await supabase
    .from("generated_documents")
    .update({
      is_finalized: true,
      finalized_at: now,
    })
    .eq("release_file_id", releaseFileId)
    .eq("is_finalized", false);

  await supabase
    .from("release_files")
    .update({
      status: "closed",
      updated_at: now,
    })
    .eq("id", releaseFileId);

  await supabase.from("ar_queue").upsert(
    {
      loan_application_id: file.loanApplicationId,
      release_file_id: releaseFileId,
      queued_at: now,
    },
    { onConflict: "loan_application_id" },
  );

  await syncApplicationBlocker(supabase, file.loanApplicationId, "closed", {
    actorId,
    applicationStatus: "closed",
  });

  // Privileged enroll: AR RLS cannot SELECT release_files / computations.
  // Same service-client pattern as the legacy receive route.
  const admin = createServiceClient();
  const ar = await initializeArAccount(
    admin,
    file.loanApplicationId,
    releaseFileId,
    actorId,
  );

  await createPendingInternalTransfers(
    admin,
    file.loanApplicationId,
    ar.masterlistId,
    actorId,
  );

  return {
    status: "closed" as const,
    masterlistId: ar.masterlistId,
    created: ar.created,
  };
}

export async function listLraQueue(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("release_queue")
    .select(
      `
      loan_application_id,
      computation_id,
      queued_at,
      loan_applications (
        id,
        application_no,
        status,
        blocker,
        updated_at,
        borrowers (
          borrower_no,
          first_name,
          last_name
        ),
        release_files (
          status,
          release_paths
        )
      )
    `,
    )
    .order("queued_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => {
    const appRaw = row.loan_applications;
    const app = Array.isArray(appRaw) ? appRaw[0] : appRaw;
    const borrowerRaw = app?.borrowers;
    const borrower = Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw;
    const releaseRaw = app?.release_files;
    const releaseFile = Array.isArray(releaseRaw) ? releaseRaw[0] : releaseRaw;

    return {
      applicationId: row.loan_application_id as string,
      computationId: row.computation_id as string,
      queuedAt: row.queued_at as string,
      application: app
        ? {
            applicationNo: app.application_no as string | null,
            status: app.status as string,
            blocker: app.blocker as string | null,
            updatedAt: app.updated_at as string,
          }
        : null,
      borrower: borrower
        ? {
            borrowerNo: borrower.borrower_no as string,
            firstName: borrower.first_name as string,
            lastName: borrower.last_name as string,
          }
        : null,
      releaseFile: releaseFile
        ? {
            status: releaseFile.status as string,
            releasePaths: Array.isArray(releaseFile.release_paths)
              ? releaseFile.release_paths
              : [],
          }
        : null,
    };
  });
}
