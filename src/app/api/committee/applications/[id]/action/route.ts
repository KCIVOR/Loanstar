import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, jsonOk } from "@/lib/api/handler";
import { executeFinalAction } from "@/lib/committee/actions";
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

    return jsonOk(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
