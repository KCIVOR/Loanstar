import type { SupabaseClient } from "@supabase/supabase-js";

import type { Stage } from "@/lib/constants";

export type DocumentStatus =
  | "pending"
  | "uploaded"
  | "confirmed"
  | "needs_revision";

export type ChecklistSegment = "seafarer" | "sme";
export type ChecklistEntityType = "individual" | "corporate";

export type ChecklistScope = {
  segment?: ChecklistSegment;
  entityType?: ChecklistEntityType | null;
};

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
  revisionRemarks: string | null;
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
  entity_type: string | null;
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
  revision_remarks: string | null;
};

/** Pure filter used by DB query post-processing and unit tests. */
export function rowMatchesChecklistScope(
  row: { segment: string | null; entity_type: string | null },
  segment: ChecklistSegment,
  entityType: ChecklistEntityType | null,
): boolean {
  if (row.segment !== segment) return false;
  if (row.entity_type == null) return true;
  return entityType != null && row.entity_type === entityType;
}

export async function loadChecklistScope(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<{ segment: ChecklistSegment; entityType: ChecklistEntityType | null }> {
  const { data, error } = await supabase
    .from("loan_applications")
    .select("segment, entity_type")
    .eq("id", applicationId)
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to load application segment: ${error?.message ?? "not found"}`,
    );
  }

  const segment: ChecklistSegment = data.segment === "sme" ? "sme" : "seafarer";
  const entityType: ChecklistEntityType | null =
    data.entity_type === "individual" || data.entity_type === "corporate"
      ? data.entity_type
      : null;

  return { segment, entityType };
}

async function resolveChecklistScope(
  supabase: SupabaseClient,
  applicationId: string,
  scope?: ChecklistScope,
): Promise<{ segment: ChecklistSegment; entityType: ChecklistEntityType | null }> {
  if (scope?.segment) {
    return {
      segment: scope.segment,
      entityType: scope.entityType ?? null,
    };
  }
  return loadChecklistScope(supabase, applicationId);
}

export async function getStageChecklist(
  supabase: SupabaseClient,
  stage: Stage | string,
  applicationId: string,
  scope?: ChecklistScope,
): Promise<ChecklistItem[]> {
  const { segment, entityType } = await resolveChecklistScope(
    supabase,
    applicationId,
    scope,
  );

  let checklistQuery = supabase
    .from("stage_checklists")
    .select(
      `
      id,
      stage,
      is_required,
      is_optional_flag,
      sort_order,
      entity_type,
      document_types ( id, slug, name )
    `,
    )
    .eq("stage", stage)
    .eq("segment", segment)
    .order("sort_order");

  if (entityType) {
    checklistQuery = checklistQuery.or(
      `entity_type.is.null,entity_type.eq.${entityType}`,
    );
  } else {
    checklistQuery = checklistQuery.is("entity_type", null);
  }

  const { data: checklistRows, error: checklistError } = await checklistQuery;

  if (checklistError) {
    throw new Error(`Failed to load stage checklist: ${checklistError.message}`);
  }

  const { data: documentRows, error: documentsError } = await supabase
    .from("documents")
    .select(
      "id, document_type_id, stage, status, file_name, mime_type, file_size, uploaded_by, confirmed_by, confirmed_at, revision_remarks",
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
      revisionRemarks: doc?.revision_remarks ?? null,
    };
  });
}

export async function ensureDocumentSlots(
  supabase: SupabaseClient,
  stage: Stage | string,
  applicationId: string,
  borrowerId: string,
  scope?: ChecklistScope,
): Promise<void> {
  const { segment, entityType } = await resolveChecklistScope(
    supabase,
    applicationId,
    scope,
  );

  let checklistQuery = supabase
    .from("stage_checklists")
    .select("document_type_id, entity_type")
    .eq("stage", stage)
    .eq("segment", segment);

  if (entityType) {
    checklistQuery = checklistQuery.or(
      `entity_type.is.null,entity_type.eq.${entityType}`,
    );
  } else {
    checklistQuery = checklistQuery.is("entity_type", null);
  }

  const { data: checklistRows, error: checklistError } = await checklistQuery;

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
