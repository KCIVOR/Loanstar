import { type NextRequest, NextResponse } from "next/server";

import { handleApiError, jsonOk } from "@/lib/api/handler";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";
import {
  classifyExistingApplications,
  type ExistingApplicationLite,
} from "@/lib/csa/create-application";

export async function GET(req: NextRequest) {
  try {
    await requireModulePermission("intake", "view");

    const email = req.nextUrl.searchParams.get("email")?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: borrower } = await supabase
      .from("borrowers")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (!borrower) {
      return jsonOk({ exists: false, servicing: [], origination: [] });
    }

    const { data: apps } = await supabase
      .from("loan_applications")
      .select("application_no, status, segment")
      .eq("borrower_id", borrower.id);

    const lite: ExistingApplicationLite[] = (apps ?? []).map((a) => ({
      applicationNo: a.application_no as string | null,
      status: a.status as string,
      segment: a.segment as string | null,
    }));

    const { servicing, origination } = classifyExistingApplications(lite);

    return jsonOk({ exists: true, servicing, origination });
  } catch (error) {
    return handleApiError(error);
  }
}
