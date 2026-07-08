import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  ForbiddenError,
  requireModulePermission,
} from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

async function getAgentLead(agentUserId: string, leadId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select(
      "id, agent_user_id, borrower_name, business_name, borrower_id, application_id, status, created_at, updated_at",
    )
    .eq("id", leadId)
    .single();

  if (error || !data) {
    throw new ForbiddenError("Lead not found");
  }

  if (data.agent_user_id !== agentUserId) {
    throw new ForbiddenError("Lead not found");
  }

  return data;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("leads", "view");
    const { id } = await params;
    const supabase = await createClient();
    const lead = await getAgentLead(user.id, id);

    let checklistFlags: Array<{
      documentTypeId: string;
      documentTypeSlug: string;
      documentTypeName: string;
      stage: string;
      isRequired: boolean;
      isOptionalFlag: boolean;
      sortOrder: number;
      completionStatus: string;
    }> = [];

    if (lead.application_id) {
      const { data: flags, error: flagsError } = await supabase.rpc(
        "get_checklist_flags",
        { p_application_id: lead.application_id },
      );

      if (flagsError) {
        throw new Error(`Failed to load checklist flags: ${flagsError.message}`);
      }

      checklistFlags = (flags ?? []).map(
        (flag: {
          document_type_id: string;
          document_type_slug: string;
          document_type_name: string;
          stage: string;
          is_required: boolean;
          is_optional_flag: boolean;
          sort_order: number;
          completion_status: string;
        }) => ({
          documentTypeId: flag.document_type_id,
          documentTypeSlug: flag.document_type_slug,
          documentTypeName: flag.document_type_name,
          stage: flag.stage,
          isRequired: flag.is_required,
          isOptionalFlag: flag.is_optional_flag,
          sortOrder: flag.sort_order,
          completionStatus: flag.completion_status,
        }),
      );
    }

    return jsonOk({
      lead: {
        id: lead.id,
        borrowerName: lead.borrower_name,
        businessName: lead.business_name,
        borrowerId: lead.borrower_id,
        applicationId: lead.application_id,
        status: lead.status,
        createdAt: lead.created_at,
        updatedAt: lead.updated_at,
      },
      checklistFlags,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
