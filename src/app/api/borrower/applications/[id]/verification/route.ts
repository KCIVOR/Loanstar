import { NextResponse } from "next/server";

import { handleApiError } from "@/lib/api/handler";
import {
  ForbiddenError,
  requireModulePermission,
} from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

/** Borrowers must not access verification content (RLS + explicit 403). */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("borrower_portal", "view");
    const { id } = await params;
    const supabase = await createClient();

    const { data } = await supabase
      .from("loan_applications")
      .select("id, borrowers!inner ( user_id )")
      .eq("id", id)
      .single();

    const borrowersRaw = data?.borrowers;
    const borrower = Array.isArray(borrowersRaw) ? borrowersRaw[0] : borrowersRaw;

    if (!borrower || borrower.user_id !== user.id) {
      throw new ForbiddenError("Application not found");
    }

    return NextResponse.json(
      { error: "Verification details are confidential" },
      { status: 403 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
