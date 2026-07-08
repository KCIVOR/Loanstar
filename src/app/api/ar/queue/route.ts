import { handleApiError, jsonOk } from "@/lib/api/handler";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    await requireModulePermission("accounting_ar", "view");
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("ar_queue")
      .select(
        `
        id,
        loan_application_id,
        queued_at,
        processed_at,
        loan_applications (
          application_no,
          status,
          borrowers ( borrower_no, first_name, last_name )
        )
      `,
      )
      .is("processed_at", null)
      .order("queued_at", { ascending: true });

    if (error) throw new Error(error.message);

    return jsonOk({ queue: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}
