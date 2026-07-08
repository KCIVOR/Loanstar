import { handleApiError, jsonOk } from "@/lib/api/handler";
import { refreshMasterlistAging } from "@/lib/ar/posting";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const user = await requireModulePermission("collection", "view");
    const supabase = await createClient();

    const { data: assignments } = await supabase
      .from("assignments")
      .select("masterlist_id")
      .eq("collector_user_id", user.id)
      .is("remedial_user_id", null);

    const ids = (assignments ?? []).map((a) => a.masterlist_id as string);
    if (!ids.length) {
      return jsonOk({ accounts: [] });
    }

    const { data, error } = await supabase
      .from("masterlist")
      .select(
        `
        *,
        amortization_schedules ( id, installment_no, due_date, amount_due, status, penalty_amount )
      `,
      )
      .in("id", ids)
      .eq("remedial_flag", false)
      .order("first_payment_date");

    if (error) throw new Error(error.message);

    for (const row of data ?? []) {
      await refreshMasterlistAging(supabase, row.id as string);
    }

    return jsonOk({ accounts: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}
