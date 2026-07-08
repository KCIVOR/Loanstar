import type { SupabaseClient } from "@supabase/supabase-js";

import { getActiveComputation } from "@/lib/csa/computation";
import { ensureDocumentSlots } from "@/lib/documents/checklist";
import { uploadDocumentBytes } from "@/lib/documents/storage";
import { initializeArAccount } from "@/lib/ar/masterlist";
import { createServiceClient } from "@/lib/supabase/server";

import { syncApplicationBlocker, mapReleaseFileRow } from "./blockers";
import { loadBlriContext } from "./blri-data";
import {
  AUTO_GENERATED_SLUGS,
  canRecordRelease,
  readyReleaseBlocker,
  releaseStageForPath,
  type ReleasePath,
  type ReleaseFileStatus,
} from "./constants";
import { hashPdfContent, renderDocumentPdf } from "./pdf/documents";

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

export async function setReleasePath(
  supabase: SupabaseClient,
  releaseFileId: string,
  path: ReleasePath,
  actorId: string,
  options?: { atmBankName?: string; atmCardLast4?: string },
) {
  const file = await getReleaseFile(supabase, releaseFileId);
  const nextStatus: ReleaseFileStatus =
    path === "with_pdc" ? "pdc_encoding" : "ready_generate";

  if (path === "without_pdc") {
    if (!options?.atmBankName?.trim()) {
      throw new Error("ATM bank name is required for Without PDC path");
    }
    if (!options?.atmCardLast4?.trim() || options.atmCardLast4.length !== 4) {
      throw new Error("ATM card last 4 digits are required for Without PDC path");
    }
  }

  const { data: app, error: appError } = await supabase
    .from("loan_applications")
    .select("borrower_id")
    .eq("id", file.loanApplicationId)
    .single();

  if (appError || !app?.borrower_id) {
    throw new Error("Application borrower not found");
  }

  const { error } = await supabase
    .from("release_files")
    .update({
      release_path: path,
      status: nextStatus,
      atm_bank_name: path === "without_pdc" ? options?.atmBankName?.trim() : null,
      atm_card_last4: path === "without_pdc" ? options?.atmCardLast4?.trim() : null,
      blank_check_from: path === "without_pdc" ? null : undefined,
      blank_check_to: path === "without_pdc" ? null : undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("id", releaseFileId);

  if (error) {
    throw new Error(error.message);
  }

  const signingStage = releaseStageForPath(path);
  await ensureDocumentSlots(
    supabase,
    signingStage,
    file.loanApplicationId,
    app.borrower_id as string,
  );
  await ensureDocumentSlots(
    supabase,
    "release",
    file.loanApplicationId,
    app.borrower_id as string,
  );

  await syncApplicationBlocker(supabase, file.loanApplicationId, nextStatus, {
    actorId,
  });

  return { status: nextStatus, releasePath: path, signingStage };
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

  if (file.releasePath !== "with_pdc") {
    throw new Error("PDC encoding only applies to With PDC path");
  }

  await supabase.from("pdc_checks").delete().eq("release_file_id", releaseFileId);

  if (checks.length > 0) {
    const { error: insertError } = await supabase.from("pdc_checks").insert(
      checks.map((row, index) => ({
        release_file_id: releaseFileId,
        check_number: row.checkNumber ?? null,
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

  return { status: "ready_generate" as const };
}

export async function generateReleaseDocuments(
  supabase: SupabaseClient,
  releaseFileId: string,
  actorId: string,
) {
  const file = await getReleaseFile(supabase, releaseFileId);

  if (!file.releasePath) {
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

  const slugs = AUTO_GENERATED_SLUGS[file.releasePath as ReleasePath];
  const { data: app } = await supabase
    .from("loan_applications")
    .select("borrower_id")
    .eq("id", file.loanApplicationId)
    .single();

  if (!app?.borrower_id) {
    throw new Error("Borrower not found");
  }

  for (const slug of slugs) {
    const pdf = renderDocumentPdf(slug, blri, computation.netReleased);
    const contentHash = hashPdfContent(pdf);
    const docId = crypto.randomUUID();
    const storagePath = `${app.borrower_id}/release/${releaseFileId}/${slug}-${docId}.pdf`;

    await uploadDocumentBytes(supabase, storagePath, pdf, "application/pdf");

    await supabase.from("generated_documents").upsert(
      {
        release_file_id: releaseFileId,
        document_slug: slug,
        storage_path: storagePath,
        content_hash: contentHash,
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

export async function signGeneratedDocument(
  supabase: SupabaseClient,
  documentId: string,
  signerId: string,
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

  const signedAt = new Date().toISOString();
  const signatureHash = doc.content_hash as string;

  const { error: updateError } = await supabase
    .from("generated_documents")
    .update({
      signed_at: signedAt,
      signed_by: signerId,
      signature_hash: signatureHash,
    })
    .eq("id", documentId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const releaseFileRaw = doc.release_files;
  const releaseFile = Array.isArray(releaseFileRaw)
    ? releaseFileRaw[0]
    : releaseFileRaw;

  if (!releaseFile) {
    return { signedAt, allSigned: false };
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
      { actorId: signerId, applicationStatus: "release_briefing" },
    );
  }

  return { signedAt, allSigned };
}

export async function signBriefingAsBorrower(
  supabase: SupabaseClient,
  releaseFileId: string,
  borrowerUserId: string,
) {
  const file = await getReleaseFile(supabase, releaseFileId);

  if (file.status !== "awaiting_briefing") {
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

  if (briefing.acknowledged_at) {
    throw new Error("Briefing already signed");
  }

  const now = new Date().toISOString();
  const checklist = Array.isArray(briefing.checklist)
    ? (briefing.checklist as Array<{ key: string; label: string }>).map(
        (item) => ({ ...item, signedAt: now }),
      )
    : [];

  await supabase
    .from("briefings")
    .update({
      acknowledged_at: now,
      acknowledged_by: borrowerUserId,
      checklist,
    })
    .eq("release_file_id", releaseFileId);

  await supabase
    .from("release_files")
    .update({
      status: "ready_release",
      updated_at: now,
    })
    .eq("id", releaseFileId);

  const blocker = readyReleaseBlocker(file.releasePath as ReleasePath | null);

  await syncApplicationBlocker(
    supabase,
    file.loanApplicationId,
    "ready_release",
    { actorId: borrowerUserId, applicationStatus: "release_ready" },
  );

  await supabase
    .from("loan_applications")
    .update({ blocker })
    .eq("id", file.loanApplicationId);

  return { status: "ready_release" as const, signedAt: now };
}

export async function resolveSignedVoucherDocumentId(
  supabase: SupabaseClient,
  applicationId: string,
) {
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

  const match = (data ?? []).find((row) => {
    const docType = Array.isArray(row.document_types)
      ? row.document_types[0]
      : row.document_types;
    return docType?.slug === "signed_check_voucher";
  });

  return (match?.id as string | undefined) ?? null;
}

export async function recordRelease(
  supabase: SupabaseClient,
  releaseFileId: string,
  actorId: string,
  notes?: string,
) {
  const file = await getReleaseFile(supabase, releaseFileId);

  const { data: briefing } = await supabase
    .from("briefings")
    .select("acknowledged_at")
    .eq("release_file_id", releaseFileId)
    .maybeSingle();

  if (!canRecordRelease(file.status, briefing?.acknowledged_at as string | null)) {
    throw new Error("Briefing must be signed by the borrower before release");
  }

  const eventType =
    file.releasePath === "without_pdc" ? "cash_released" : "check_released";

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

  return { status: "released" as const };
}

export async function closeRelease(
  supabase: SupabaseClient,
  releaseFileId: string,
  actorId: string,
  signedVoucherDocumentId?: string,
) {
  const file = await getReleaseFile(supabase, releaseFileId);

  if (file.status !== "released") {
    throw new Error("Release must be recorded before closure");
  }

  const voucherId =
    signedVoucherDocumentId ??
    (await resolveSignedVoucherDocumentId(supabase, file.loanApplicationId));

  if (!voucherId) {
    throw new Error(
      "Upload the signed check voucher on the release checklist before closing",
    );
  }

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

  await initializeArAccount(
    supabase,
    file.loanApplicationId,
    releaseFileId,
    actorId,
  );

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
    };
  });
}
