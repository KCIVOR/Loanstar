import { NextResponse } from "next/server";

import { handleApiError, jsonOk } from "@/lib/api/handler";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    await requireModulePermission("leads", "view");
    const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";

    if (q.length < 2) {
      return jsonOk({ matches: [] as Array<{ id: string; displayName: string }> });
    }

    if (q.length > 100) {
      return NextResponse.json({ error: "Query too long" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("search_borrower_names", {
      p_query: q,
    });

    if (error) throw new Error(error.message);

    const matches = (data ?? []).map(
      (row: { id: string; display_name: string }) => ({
        id: row.id as string,
        displayName: row.display_name as string,
      }),
    );

    return jsonOk({ matches });
  } catch (error) {
    return handleApiError(error);
  }
}
