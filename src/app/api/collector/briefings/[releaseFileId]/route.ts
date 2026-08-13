import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { acknowledgeBriefing } from "@/lib/lra/release-service";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ releaseFileId: string }> };

const ackSchema = z.object({ confirm: z.literal(true) });

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("briefings", "execute_trigger");
    const { releaseFileId } = await params;
    ackSchema.parse(await request.json());
    const supabase = await createClient();

    const result = await acknowledgeBriefing(supabase, releaseFileId, user.id);

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "collection",
      action: "execute_trigger",
      entityType: "briefing",
      entityId: releaseFileId,
      afterData: { trigger: "collector_briefing_ack", ...result },
    });

    return jsonOk(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
