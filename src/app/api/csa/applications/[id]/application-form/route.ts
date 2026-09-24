import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { resolveAssignedAgentName } from "@/lib/csa/agent-assignment";
import { generateApplicationForm } from "@/lib/documents/generators/application-form";
import { resolveApplicationFormSlug } from "@/lib/documents/generators/application-form-context";
import {
  getRenderedDocumentDownloadUrl,
  listRenderedDocuments,
} from "@/lib/documents/render-store";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

async function loadApplicationScope(supabase: Awaited<ReturnType<typeof createClient>>, applicationId: string) {
  const { data, error } = await supabase
    .from("loan_applications")
    .select("segment, entity_type, agent_user_id")
    .eq("id", applicationId)
    .single();

  if (error || !data) {
    throw new Error("Application not found");
  }

  return {
    segment: data.segment as string | null,
    entityType: data.entity_type as string | null,
    agentUserId: data.agent_user_id as string | null,
  };
}

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("intake", "edit");
    const { id: applicationId } = await params;
    const supabase = await createClient();

    const result = await generateApplicationForm(supabase, {
      applicationId,
      actorId: user.id,
    });

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "intake",
      action: "execute_trigger",
      entityType: "rendered_document",
      entityId: result.documentId,
      afterData: {
        trigger: "generate_application_form",
        applicationId,
        documentSlug: result.documentSlug,
      },
    });

    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await requireModulePermission("intake", "view");
    const { id: applicationId } = await params;
    const supabase = await createClient();

    const scope = await loadApplicationScope(supabase, applicationId);
    const resolved = resolveApplicationFormSlug(scope);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: 400 });
    }

    const docs = await listRenderedDocuments(supabase, applicationId, {
      slug: resolved.slug,
    });

    const withUrls = await Promise.all(
      docs.map(async (doc) => ({
        ...doc,
        downloadUrl: await getRenderedDocumentDownloadUrl(supabase, doc.id),
      })),
    );

    // profiles RLS requires a service client to resolve another user's name
    // (see agent-assignment.ts) — read-only, scoped to the one id already on
    // an application this caller is authorized to view (`intake:view` above).
    const assignedAgentName = await resolveAssignedAgentName(
      createServiceClient(),
      scope.agentUserId,
    );

    return jsonOk({
      documents: withUrls,
      documentSlug: resolved.slug,
      assignedAgentName,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
