import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, jsonOk } from "@/lib/api/handler";
import { attemptApplicationApprovedEmail } from "@/lib/committee/approval-email";
import { executeFinalAction } from "@/lib/committee/actions";
import { attemptApplicationDeniedEmail } from "@/lib/committee/denial-email";
import { getApplicationForStaff } from "@/lib/csa/application";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const actionSchema = z.object({
  action: z.enum(["approve", "deny", "revisit", "hold"]),
  comment: z.string().optional(),
  revisitRoute: z.enum(["csa", "cig"]).optional(),
});

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("committee", "execute_trigger");
    const { id } = await params;
    const body = actionSchema.parse(await request.json());
    const supabase = await createClient();

    if (body.action === "revisit" && !body.revisitRoute) {
      return NextResponse.json(
        { error: "revisitRoute is required for Notice to Revisit" },
        { status: 400 },
      );
    }

    const result = await executeFinalAction(supabase, id, user.id, body.action, {
      comment: body.comment,
      revisitRoute: body.revisitRoute,
    });

    // Phase 4: denial email fires on Deny (not on CIG's courtesy-call confirm).
    // Failure must not roll back the decision — attemptApplicationDeniedEmail
    // swallows errors and audits emailSent.
    if (body.action === "deny") {
      const application = await getApplicationForStaff(supabase, id);
      const borrowerRaw = application.borrowers;
      const borrower = Array.isArray(borrowerRaw)
        ? borrowerRaw[0]
        : borrowerRaw;
      await attemptApplicationDeniedEmail({
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
    }

    if (body.action === "approve") {
      const application = await getApplicationForStaff(supabase, id);
      const borrowerRaw = application.borrowers;
      const borrower = Array.isArray(borrowerRaw)
        ? borrowerRaw[0]
        : borrowerRaw;
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
    }

    return jsonOk(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
