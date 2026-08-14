import { handleApiError, jsonOk } from "@/lib/api/handler";
import { requireModulePermission } from "@/lib/permissions/server";
import { createServiceClient } from "@/lib/supabase/server";

/** Read-only classification code→label map for AR UI (system_config-gated admin config is not reachable to AR). */
export async function GET() {
  try {
    await requireModulePermission("accounting_ar", "view");
    // config_settings SELECT is RLS-gated to system_config; AR must not get that module.
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("config_settings")
      .select("value")
      .eq("key", "bir_status_codes")
      .maybeSingle();

    if (error) throw new Error(error.message);

    const raw = data?.value;
    const codes =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, string>)
        : {};

    return jsonOk({ codes });
  } catch (error) {
    return handleApiError(error);
  }
}
