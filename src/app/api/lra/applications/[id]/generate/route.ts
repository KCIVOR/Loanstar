import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  generateReleaseDocumentBySlug,
  generateReleaseDocuments,
} from "@/lib/lra/release-service";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("release_lra", "edit");
    const { id } = await params;
    const supabase = await createClient();

    // Optional body: `{ slug }` generates/regenerates one document; no body
    // (or no slug) runs the full "Generate all" set.
    const body = (await request.json().catch(() => ({}))) as { slug?: unknown };
    const slug = typeof body.slug === "string" ? body.slug : null;

    const { data: releaseFile } = await supabase
      .from("release_files")
      .select("id")
      .eq("loan_application_id", id)
      .single();

    if (!releaseFile) {
      throw new Error("Release file not found");
    }

    const result = slug
      ? await generateReleaseDocumentBySlug(
          supabase,
          releaseFile.id,
          slug,
          user.id,
        )
      : await generateReleaseDocuments(supabase, releaseFile.id, user.id);

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "release_lra",
      action: "execute_trigger",
      entityType: "release_file",
      entityId: releaseFile.id,
      afterData: {
        trigger: slug ? "generate_document" : "generate_documents",
        ...result,
      },
    });

    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
