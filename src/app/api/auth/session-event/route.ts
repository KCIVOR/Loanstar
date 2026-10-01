import { NextResponse } from "next/server";
import { z } from "zod";
import { formatZodError } from "@/lib/api/zod-error";

import { handleApiError } from "@/lib/api/handler";
import { writeAuditEvent } from "@/lib/audit/writer";
import { requireAuth } from "@/lib/permissions/server";

const schema = z.object({ event: z.enum(["login", "logout"]) });

/**
 * Records a sign-in / sign-out in the Activity Log. Sign-in and sign-out run
 * in the browser (Supabase auth), so the client calls this right after a
 * successful sign-in and right before signing out (while the session exists).
 */
export async function POST(request: Request) {
  try {
    const { event } = schema.parse(await request.json());
    const user = await requireAuth();

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "auth_admin",
      action: event,
      entityType: "user",
      entityId: user.id,
      afterData: { email: user.email ?? null },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: formatZodError(error) }, { status: 400 });
    }
    return handleApiError(error);
  }
}
