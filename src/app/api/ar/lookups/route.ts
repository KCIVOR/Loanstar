import { handleApiError, jsonOk } from "@/lib/api/handler";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    await requireModulePermission("accounting_ar", "view");
    const supabase = await createClient();

    const { data: portfolios } = await supabase
      .from("portfolios")
      .select("id, name, investor_label")
      .eq("is_active", true)
      .order("name");

    const { data: collectors } = await supabase
      .from("user_roles")
      .select("user_id, roles!inner ( slug )")
      .eq("roles.slug", "collector");

    const collectorIds = (collectors ?? []).map((row) => row.user_id as string);

    let profiles: Array<{ id: string; email: string; full_name: string | null }> = [];
    if (collectorIds.length) {
      const { data } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", collectorIds);
      profiles = data ?? [];
    }

    const { data: remedialRoles } = await supabase
      .from("user_roles")
      .select("user_id, roles!inner ( slug )")
      .eq("roles.slug", "remedial");

    const remedialIds = (remedialRoles ?? []).map((row) => row.user_id as string);
    let remedialProfiles: typeof profiles = [];
    if (remedialIds.length) {
      const { data } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", remedialIds);
      remedialProfiles = data ?? [];
    }

    return jsonOk({
      portfolios: portfolios ?? [],
      collectors: profiles,
      remedialStaff: remedialProfiles,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
