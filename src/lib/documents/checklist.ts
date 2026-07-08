import type { SupabaseClient } from "@supabase/supabase-js";

import type { Stage } from "@/lib/constants";

export type DocumentStatus = "pending" | "uploaded" | "confirmed";

export type ChecklistItem = {
  documentTypeId: string;
  documentTypeSlug: string;
  documentTypeName: string;
  stage: Stage | string;
  isRequired: boolean;
  isOptionalFlag: boolean;
  sortOrder: number;
  documentId: string | null;
  status: DocumentStatus | null;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  uploadedBy: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
};

export type CompletionSummary = {
  total: number;
  required: number;
  complete: number;
  uploaded: number;
  incomplete: number;
  percentComplete: number;
};

type StageChecklistRow = {
  id: string;
  stage: string;
  is_required: boolean;
  is_optional_flag: boolean;
  sort_order: number;
  document_types: {
    id: string;
    slug: string;
    name: string;
  } | {
    id: string;
    slug: string;
    name: string;
  }[];
};

type DocumentRow = {
  id: string;
  document_type_id: string;
  stage: string;
  status: DocumentStatus;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
};

export async function getStageChecklist(
  supabase: SupabaseClient,
  stage: Stage | string,
  applicationId: string,
): Promise<ChecklistItem[]> {
  const { data: checklistRows, error: checklistError } = await supabase
    .from("stage_checklists")
    .select(
      `
      id,
      stage,
      is_required,
      is_optional_flag,
      sort_order,
      document_types ( id, slug, name )
    `,
    )
    .eq("stage", stage)
    .order("sort_order");

  if (checklistError) {
    throw new Error(`Failed to load stage checklist: ${checklistError.message}`);
  }

  const { data: documentRows, error: documentsError } = await supabase
    .from("documents")
    .select(
      "id, document_type_id, stage, status, file_name, mime_type, file_size, uploaded_by, confirmed_by, confirmed_at",
    )
    .eq("loan_application_id", applicationId)
    .eq("stage", stage);

  if (documentsError) {
    throw new Error(`Failed to load application documents: ${documentsError.message}`);
  }

  const documentsByType = new Map<string, DocumentRow>();
  for (const doc of (documentRows ?? []) as DocumentRow[]) {
    documentsByType.set(doc.document_type_id, doc);
  }

  return ((checklistRows ?? []) as StageChecklistRow[]).map((row) => {
    const docType = Array.isArray(row.document_types)
      ? row.document_types[0]
      : row.document_types;
    const doc = docType ? documentsByType.get(docType.id) : undefined;

    return {
      documentTypeId: docType?.id ?? "",
      documentTypeSlug: docType?.slug ?? "",
      documentTypeName: docType?.name ?? "",
      stage: row.stage,
      isRequired: row.is_required,
      isOptionalFlag: row.is_optional_flag,
      sortOrder: row.sort_order,
      documentId: doc?.id ?? null,
      status: doc?.status ?? null,
      fileName: doc?.file_name ?? null,
      mimeType: doc?.mime_type ?? null,
      fileSize: doc?.file_size ?? null,
      uploadedBy: doc?.uploaded_by ?? null,
      confirmedBy: doc?.confirmed_by ?? null,
      confirmedAt: doc?.confirmed_at ?? null,
    };
  });
}

export async function ensureDocumentSlots(
  supabase: SupabaseClient,
  stage: Stage | string,
  applicationId: string,
  borrowerId: string,
): Promise<void> {
  const { data: checklistRows, error: checklistError } = await supabase
    .from("stage_checklists")
    .select("document_type_id")
    .eq("stage", stage);

  if (checklistError) {
    throw new Error(`Failed to load checklist for slots: ${checklistError.message}`);
  }

  if (!checklistRows?.length) return;

  const { data: existingDocs, error: existingError } = await supabase
    .from("documents")
    .select("document_type_id")
    .eq("loan_application_id", applicationId)
    .eq("stage", stage);

  if (existingError) {
    throw new Error(`Failed to load existing document slots: ${existingError.message}`);
  }

  const existingTypes = new Set(
    (existingDocs ?? []).map((d) => d.document_type_id as string),
  );

  const toInsert = checklistRows
    .filter((row) => !existingTypes.has(row.document_type_id as string))
    .map((row) => ({
      borrower_id: borrowerId,
      loan_application_id: applicationId,
      document_type_id: row.document_type_id,
      stage,
      status: "pending" as const,
    }));

  if (!toInsert.length) return;

  const { error: insertError } = await supabase.from("documents").insert(toInsert);

  if (insertError) {
    throw new Error(`Failed to create document slots: ${insertError.message}`);
  }
}

export function getCompletionSummary(items: ChecklistItem[]): CompletionSummary {
  const requiredItems = items.filter((item) => item.isRequired);
  const complete = requiredItems.filter((item) => item.status === "confirmed");
  const uploaded = requiredItems.filter(
    (item) => item.status === "uploaded" || item.status === "confirmed",
  );
  const incomplete = requiredItems.filter(
    (item) => item.status !== "confirmed" && item.status !== "uploaded",
  );

  const total = items.length;
  const required = requiredItems.length;
  const completeCount = complete.length;
  const percentComplete =
    required === 0 ? 100 : Math.round((completeCount / required) * 100);

  return {
    total,
    required,
    complete: completeCount,
    uploaded: uploaded.length,
    incomplete: incomplete.length,
    percentComplete,
  };
}
