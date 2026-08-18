import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, jsonOk } from "@/lib/api/handler";
import { attemptApplicationApprovedEmail } from "@/lib/committee/approval-email";
import { approveDiscloseAndWitnessSign } from "@/lib/committee/actions";
import { getApplicationForStaff } from "@/lib/csa/application";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const bodySchema = z.object({ comment: z.string().optional() });

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("committee", "execute_trigger");
    const { id } = await params;
    const body = bodySchema.parse(await request.json());
    const supabase = await createClient();

    const result = await approveDiscloseAndWitnessSign(supabase, id, user.id, {
      comment: body.comment,
    });

    // Same approved-email attempt as the normal Approve action — the borrower
    // (if reachable by email) still hears the decision even though disclosure
    // and signing happened in-branch, not through their own portal session.
    const application = await getApplicationForStaff(supabase, id);
    const borrowerRaw = application.borrowers;
    const borrower = Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw;
    await attemptApplicationApprovedEmail({
      actorId: user.id,
      applicationId: id,
      supabase,
      borrower: borrower
        ? {
            email: borrower.email as string | null,
            first_name: borrower.first_name as string | null,
            last_name: borrower.last_name as string | null,
            user_id: borrower.user_id as string | null,
          }
        : null,
    });

    return jsonOk(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
