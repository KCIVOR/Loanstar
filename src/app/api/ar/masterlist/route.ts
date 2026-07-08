import { NextResponse } from "next/server";

import { handleApiError, jsonOk } from "@/lib/api/handler";
import { masterlistToCsv } from "@/lib/ar/masterlist";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    await requireModulePermission("accounting_ar", "view");
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("masterlist")
      .select(
        `
        *,
        portfolios ( name, investor_label ),
        assignments ( collector_user_id, remedial_user_id )
      `,
      )
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return jsonOk({ masterlist: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST() {
  try {
    await requireModulePermission("accounting_ar", "view");
    const supabase = await createClient();

    const { data, error } = await supabase.from("masterlist").select("*");

    if (error) throw new Error(error.message);

    const csv = masterlistToCsv((data ?? []) as Array<Record<string, unknown>>);

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="masterlist-export.csv"',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
