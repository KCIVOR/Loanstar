import { handleApiError, jsonOk } from "@/lib/api/handler";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    await requireModulePermission("accounting_ar", "view");
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("dcr")
      .select(
        `
        *,
        dcr_items (
          id,
          amount,
          payments (
            id,
            reference_no,
            payment_date,
            amount,
            masterlist_id,
            masterlist ( borrower_name, loan_account_no )
          )
        )
      `,
      )
      .eq("status", "submitted")
      .order("submitted_at", { ascending: true });

    if (error) throw new Error(error.message);

    return jsonOk({ dcrQueue: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}
