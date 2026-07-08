import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  ForbiddenError,
  requireModulePermission,
} from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("system_config", "delete");
    const { id } = await params;
    const supabase = await createClient();

    const { data: before, error: fetchError } = await supabase
      .from("stage_checklists")
      .select(
        `
        id,
        stage,
        is_required,
        is_optional_flag,
        sort_order,
        document_type_id,
        document_types ( slug, name )
      `,
      )
      .eq("id", id)
      .single();

    if (fetchError || !before) {
      throw new ForbiddenError("Checklist item not found");
    }

    const { error: deleteError } = await supabase
      .from("stage_checklists")
      .delete()
      .eq("id", id);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    const docType = Array.isArray(before.document_types)
      ? before.document_types[0]
      : before.document_types;

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "system_config",
      action: "delete",
      entityType: "stage_checklist",
      entityId: id,
      beforeData: {
        stage: before.stage,
        documentTypeId: before.document_type_id,
        documentTypeSlug: docType?.slug,
        isRequired: before.is_required,
        isOptionalFlag: before.is_optional_flag,
        sortOrder: before.sort_order,
      },
    });

    return jsonOk({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
