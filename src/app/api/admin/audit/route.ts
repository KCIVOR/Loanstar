import { handleApiError, jsonOk } from "@/lib/api/handler";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    await requireModulePermission("audit_log", "view");
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);
    const offset = Number(searchParams.get("offset") ?? 0);
    const supabase = await createClient();

    const { data, error, count } = await supabase
      .from("audit_events")
      .select(
        "id, actor_id, actor_role_id, module_slug, action, entity_type, entity_id, before_data, after_data, ip_address, created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(error.message);

    return jsonOk({ events: data ?? [], total: count ?? 0, limit, offset });
  } catch (error) {
    return handleApiError(error);
  }
}
