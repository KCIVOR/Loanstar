import { handleApiError, jsonOk } from "@/lib/api/handler";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    await requireModulePermission("system_config", "view");
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("loan_types")
      .select(
        "id, name, interest_rate, pf_rate, effective_from, effective_to, enrolled_at",
      )
      .eq("is_active", true)
      .order("name")
      .order("effective_from", { ascending: false });

    if (error) throw new Error(error.message);

    const latestByName = new Map<string, NonNullable<typeof data>[number]>();
    for (const row of data ?? []) {
      if (!latestByName.has(row.name)) {
        latestByName.set(row.name, row);
      }
    }

    return jsonOk({ loanTypes: Array.from(latestByName.values()) });
  } catch (error) {
    return handleApiError(error);
  }
}
