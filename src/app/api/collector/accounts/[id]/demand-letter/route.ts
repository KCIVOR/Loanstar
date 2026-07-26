import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  generateDemandLetter,
  isDemandStage,
} from "@/lib/documents/generators/demand-letter";
import {
  getRenderedDocumentDownloadUrl,
  listRenderedDocuments,
} from "@/lib/documents/render-store";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  demandStage: z
    .string()
    .refine(isDemandStage, "demandStage must be first_reminder | second_demand | final_demand"),
  deadlineDays: z.number().int().min(1).max(90).optional(),
});

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("collection", "edit");
    const { id: masterlistId } = await params;
    const input = bodySchema.parse(await request.json());
    const supabase = await createClient();

    const result = await generateDemandLetter(supabase, {
      masterlistId,
      demandStage: input.demandStage,
      actorId: user.id,
      deadlineDays: input.deadlineDays,
    });

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "collection",
      action: "execute_trigger",
      entityType: "rendered_document",
      entityId: result.documentId,
      afterData: { trigger: "generate_demand_letter", masterlistId, demandStage: input.demandStage },
    });

    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await requireModulePermission("collection", "view");
    const { id: masterlistId } = await params;
    const supabase = await createClient();

    const { data: account, error } = await supabase
      .from("masterlist")
      .select("loan_application_id")
      .eq("id", masterlistId)
      .single();
    if (error || !account?.loan_application_id) {
      throw new Error("Masterlist account not found");
    }

    const docs = await listRenderedDocuments(
      supabase,
      account.loan_application_id as string,
      { slug: "demand_letter" },
    );

    const withUrls = await Promise.all(
      docs.map(async (doc) => ({
        ...doc,
        downloadUrl: await getRenderedDocumentDownloadUrl(supabase, doc.id),
      })),
    );

    return jsonOk({ documents: withUrls });
  } catch (error) {
    return handleApiError(error);
  }
}
