import { handleApiError, jsonOk } from "@/lib/api/handler";
import { getCigQueue } from "@/lib/cig/queue";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    await requireModulePermission("verification", "view");
    const supabase = await createClient();
    const applications = await getCigQueue(supabase);
    return jsonOk({ applications });
  } catch (error) {
    return handleApiError(error);
  }
}
