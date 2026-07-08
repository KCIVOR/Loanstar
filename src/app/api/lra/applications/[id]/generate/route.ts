import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { generateReleaseDocuments } from "@/lib/lra/release-service";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("release_lra", "edit");
    const { id } = await params;
    const supabase = await createClient();

    const { data: releaseFile } = await supabase
      .from("release_files")
      .select("id")
      .eq("loan_application_id", id)
      .single();

    if (!releaseFile) {
      throw new Error("Release file not found");
    }

    const result = await generateReleaseDocuments(
      supabase,
      releaseFile.id,
      user.id,
    );

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "release_lra",
      action: "execute_trigger",
      entityType: "release_file",
      entityId: releaseFile.id,
      afterData: { trigger: "generate_documents", ...result },
    });

    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
