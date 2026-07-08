import { handleApiError, jsonOk } from "@/lib/api/handler";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const user = await requireModulePermission("collection", "view");
    const supabase = await createClient();

    const { data: assignments } = await supabase
      .from("assignments")
      .select("masterlist_id")
      .eq("collector_user_id", user.id);

    const ids = (assignments ?? []).map((a) => a.masterlist_id as string);
    if (!ids.length) {
      return jsonOk({ payments: [] });
    }

    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .in("masterlist_id", ids)
      .in("status", ["pending_verification", "confirmed"])
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return jsonOk({ payments: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}
