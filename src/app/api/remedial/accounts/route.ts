import { handleApiError, jsonOk } from "@/lib/api/handler";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const user = await requireModulePermission("remedial", "view");
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("masterlist")
      .select(
        `
        *,
        assignments!inner ( remedial_user_id ),
        amortization_schedules ( installment_no, due_date, amount_due, status, penalty_amount )
      `,
      )
      .eq("assignments.remedial_user_id", user.id)
      .eq("remedial_flag", true)
      .order("updated_at", { ascending: false });

    if (error) throw new Error(error.message);

    return jsonOk({ accounts: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}
