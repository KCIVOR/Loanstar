import { handleApiError, jsonOk } from "@/lib/api/handler";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    await requireModulePermission("system_config", "view");
    const supabase = await createClient();

    const { data: checkTypes, error: checkError } = await supabase
      .from("check_types")
      .select("id, slug, name, description, created_at")
      .order("name");

    if (checkError) throw new Error(checkError.message);

    const { data: mappings, error: mapError } = await supabase
      .from("stage_check_mapping")
      .select(
        "id, stage, sort_order, check_types ( id, slug, name, description )",
      )
      .order("stage")
      .order("sort_order");

    if (mapError) throw new Error(mapError.message);

    return jsonOk({ checkTypes: checkTypes ?? [], mappings: mappings ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}
