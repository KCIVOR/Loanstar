import { handleApiError, jsonOk } from "@/lib/api/handler";
import { listLraQueue } from "@/lib/lra/release-service";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    await requireModulePermission("release_lra", "view");
    const supabase = await createClient();
    const queue = await listLraQueue(supabase);
    return jsonOk({ queue });
  } catch (error) {
    return handleApiError(error);
  }
}
