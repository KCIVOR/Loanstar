import { handleApiError, jsonOk } from "@/lib/api/handler";
import { searchBorrowerAccounts } from "@/lib/csa/connect-borrower";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    await requireModulePermission("intake", "view");
    const { searchParams } = new URL(request.url);
    const term = searchParams.get("q") ?? "";
    const supabase = await createClient();

    const results = await searchBorrowerAccounts(supabase, term);

    return jsonOk({ borrowers: results });
  } catch (error) {
    return handleApiError(error);
  }
}
