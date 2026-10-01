import { NextResponse } from "next/server";
import { z } from "zod";

import { getRequestIp } from "@/lib/permissions/server";
import { createServiceClient } from "@/lib/supabase/server";

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(254) });

/** Max failed-attempt rows recorded per IP per minute (stops log flooding). */
const MAX_PER_MINUTE = 10;

/**
 * Records a failed sign-in attempt (no session exists, so no actor). Stores
 * only the typed email and the IP — never the password. Always answers 204 so
 * the endpoint reveals nothing about accounts.
 */
export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return new NextResponse(null, { status: 204 });

    const service = createServiceClient();
    const ip = await getRequestIp();
    const since = new Date(Date.now() - 60_000).toISOString();

    let recent = service
      .from("audit_events")
      .select("id", { count: "exact", head: true })
      .eq("action", "login_failed")
      .gte("created_at", since);
    recent = ip ? recent.eq("ip_address", ip) : recent.is("ip_address", null);
    const { count } = await recent;

    if ((count ?? 0) < MAX_PER_MINUTE) {
      await service.from("audit_events").insert({
        actor_id: null,
        module_slug: "auth_admin",
        action: "login_failed",
        entity_type: "user",
        after_data: { email: parsed.data.email },
        ip_address: ip,
      });
    }
  } catch (error) {
    console.error(
      "Failed to record failed sign-in:",
      error instanceof Error ? error.message : error,
    );
  }
  return new NextResponse(null, { status: 204 });
}
