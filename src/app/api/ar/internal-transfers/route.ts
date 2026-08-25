import { handleApiError, jsonOk } from "@/lib/api/handler";
import { listPendingInternalTransfers } from "@/lib/ar/internal-transfers";
import { requireModulePermission } from "@/lib/permissions/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    await requireModulePermission("accounting_ar", "view");
    // Service role: this list joins loan_applications and both sides of
    // masterlist, which staff RLS doesn't uniformly grant across all three.
    const transfers = await listPendingInternalTransfers(createServiceClient());
    return jsonOk({ transfers });
  } catch (error) {
    return handleApiError(error);
  }
}
