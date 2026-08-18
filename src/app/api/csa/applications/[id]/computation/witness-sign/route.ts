import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, jsonOk } from "@/lib/api/handler";
import { getApplicationForStaff } from "@/lib/csa/application";
import { witnessSignComputation } from "@/lib/negotiation/service";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const signSchema = z.object({ confirm: z.literal(true) });

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("computation", "execute_trigger");
    const { id } = await params;
    signSchema.parse(await request.json());
    const supabase = await createClient();

    // Not assertCsaCanEdit: this action must also work post-endorsement,
    // when the file is back with CSA only for post-disclosure signing
    // (negotiation.status === "awaiting_signature") and no longer in a
    // CSA-editable status.
    await getApplicationForStaff(supabase, id);

    const result = await witnessSignComputation(supabase, id, user.id);

    return jsonOk(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
