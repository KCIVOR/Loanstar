import { handleApiError, jsonOk } from "@/lib/api/handler";
import { getPaymentProofSignedDownload } from "@/lib/payments/download";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await requireModulePermission("accounting_ar", "view");
    const { id } = await params;
    const supabase = await createClient();
    const result = await getPaymentProofSignedDownload(supabase, id);
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
