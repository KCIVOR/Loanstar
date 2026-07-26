import { handleApiError, jsonOk } from "@/lib/api/handler";
import { getTemplateWithVersions } from "@/lib/documents/templates/service";
import { ForbiddenError, requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireModulePermission("system_config", "view");
    const { id } = await context.params;
    const supabase = await createClient();

    const result = await getTemplateWithVersions(supabase, id);
    if (!result) {
      throw new ForbiddenError("Template not found");
    }
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
