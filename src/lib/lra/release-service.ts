import type { SupabaseClient } from "@supabase/supabase-js";

import { mapBorrowerRow, type BorrowerRow } from "@/lib/borrowers/types";
import { getActiveComputation } from "@/lib/csa/computation";
import { ensureDocumentSlots } from "@/lib/documents/checklist";
import { hashPdf, renderTemplateToPdf } from "@/lib/documents/render";
import { uploadDocumentBytes } from "@/lib/documents/storage";
import { getPublishedTemplate } from "@/lib/documents/templates/service";
import { createServiceClient } from "@/lib/supabase/server";

import { syncApplicationBlocker, mapReleaseFileRow } from "./blockers";
import { loadBlriContext } from "./blri-data";
import {
  AUTO_GENERATED_SLUGS,
  canRecordRelease,
  releaseStageForPath,
  type ReleasePath,
  type ReleaseFileStatus,
} from "./constants";
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
    throw new Error("Application is not in the LRA queue");
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
    throw new Error("At least one release path is required");
  }

  const file = await getReleaseFile(supabase, releaseFileId);
  const nextStatus: ReleaseFileStatus = paths.includes("with_pdc")
    ? "pdc_encoding"
    : "ready_generate";

  if (paths.includes("without_pdc")) {
    if (!options?.atmBankName?.trim()) {
      throw new Error("ATM bank name is required for Without PDC path");
    }
    if (!options?.atmCardLast4?.trim() || options.atmCardLast4.length !== 4) {
      throw new Error("ATM card last 4 digits are required for Without PDC path");
    }
    if (!options?.atmAccountNumber?.trim()) {
      throw new Error("ATM account number is required for Without PDC path");
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
    segment: (app.segment === "sme" ? "sme" : "seafarer") as "seafarer" | "sme",
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
    throw new Error("PDC encoding only applies to With PDC path");
  }

  const computation = await getActiveComputation(
    supabase,
    file.loanApplicationId,
  );
  if (!computation) {
    throw new Error("No active computation found for this application");
  }

  if (checks.length !== computation.terms) {
    throw new Error(
      `Number of checks must equal the loan term (${computation.terms})`,
    );
  }

  const normalizedChecks = checks.map((row) => {
    const checkNumber = row.checkNumber?.trim();
    if (!checkNumber) {
      throw new Error("Check number is required for every PDC");
    }
    const bankName = row.bankName.trim();
    if (!bankName) {
      throw new Error("Bank/Branch is required for every PDC");
    }
    return { ...row, checkNumber, bankName };
  });

  for (const row of normalizedChecks) {
    if (row.amount !== computation.monthlyAmortization) {
      throw new Error(
        `Check amount must equal the monthly amortization (₱${computation.monthlyAmortization})`,
      );
    }
  }

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

export async function generateReleaseDocuments(
  supabase: SupabaseClient,
  releaseFileId: string,
  actorId: string,
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

  if (releasePaths.length === 0) {
    throw new Error("Release path must be selected first");
  }

  if (!["ready_generate", "awaiting_signatures"].includes(file.status)) {
    throw new Error("Documents cannot be generated at this stage");
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

  const slugs = [
    ...new Set(releasePaths.flatMap((p) => AUTO_GENERATED_SLUGS[p])),
  ];
  const { data: app } = await supabase
    .from("loan_applications")
    .select("borrower_id, segment, borrowers (*)")
    .eq("id", file.loanApplicationId)
    .single();

  if (!app?.borrower_id) {
    throw new Error("Borrower not found");
  }

  // One merge context per selected path — voucher pairs need path-specific
  // disbursement fields; shared slugs are path-independent.
  const borrowerRaw = app.borrowers;
  const borrowerProfile = mapBorrowerRow(
    (Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw) as BorrowerRow,
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
  };
  const segmentScope = {
    segment: (app.segment === "sme" ? "sme" : "seafarer") as "sme" | "seafarer",
  };
  const contextByPath = new Map(
    releasePaths.map((p) => [
      p,
      buildReleaseTemplateContext(
        blri,
        computationInput,
        borrowerProfile,
        p,
        segmentScope,
      ),
    ]),
  );

  for (const slug of slugs) {
    // All release documents render from published templates (the legacy
    // hardcoded renderer was retired in Phase 7). A missing published template
    // is a hard error — every release slug is seeded + published.
    const published = await getPublishedTemplate(supabase, slug);
    if (!published) {
      throw new Error(
        `No published template for release document "${slug}" — cannot generate.`,
      );
    }

    const onlyWithPdc =
      AUTO_GENERATED_SLUGS.with_pdc.includes(slug) &&
      !AUTO_GENERATED_SLUGS.without_pdc.includes(slug);
    const onlyWithoutPdc =
      AUTO_GENERATED_SLUGS.without_pdc.includes(slug) &&
      !AUTO_GENERATED_SLUGS.with_pdc.includes(slug);
    const contextPath: ReleasePath = onlyWithPdc
      ? "with_pdc"
      : onlyWithoutPdc
        ? "without_pdc"
        : releasePaths[0];
    const templateContext = contextByPath.get(contextPath);
    if (!templateContext) {
      throw new Error(`Missing template context for path "${contextPath}"`);
    }

    const pdf = await renderTemplateToPdf(published.body, templateContext);
    const templateVersionId = published.versionId;

    const contentHash = hashPdf(pdf);
    const docId = crypto.randomUUID();
    const storagePath = `${app.borrower_id}/release/${releaseFileId}/${slug}-${docId}.pdf`;

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
        signature_hash: null,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "release_file_id,document_slug" },
    );
  }

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
    file.loanApplicationId,
    "awaiting_signatures",
    { actorId },
  );

  return { status: "awaiting_signatures" as const, slugs };
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
    throw new Error("Document not available for signing");
  }

  if (doc.signed_at) {
    throw new Error("Document already signed");
  }

  const releaseFileRaw = doc.release_files;
  const releaseFile = Array.isArray(releaseFileRaw)
    ? releaseFileRaw[0]
    : releaseFileRaw;

  if (releaseFile?.status !== "awaiting_signatures") {
    throw new Error("Release file is not in the signing stage");
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
    throw new Error("Document is not signed");
  }

  if (doc.is_finalized) {
    throw new Error("Document not available for unsigning");
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
      throw new Error(
        "Briefing has already been acknowledged — signature can no longer be undone",
      );
    }

    rolledBackToSigning = true;
  } else {
    throw new Error(
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
    throw new Error("Briefing not pending");
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
      throw new Error("Briefing not pending");
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
    throw new Error("Briefing must be signed by the borrower before release");
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

  if (file.status !== "released") {
    throw new Error("Release must be recorded before closure");
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
    throw new Error(
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

  // AR hand-off stops here: the ar_queue row is AR's work item. The masterlist
  // account is created when AR explicitly receives the file (ar_receive_file
  // trigger), not automatically at close.
  return { status: "closed" as const };
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
