import { NextResponse } from "next/server";

import { handleApiError, jsonOk } from "@/lib/api/handler";
import { runPaymentDueReminders } from "@/lib/collector/reminders";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Daily automated payment reminders (email + SMS when enabled).
 * Auth: Authorization: Bearer <CRON_SECRET> (must match env CRON_SECRET).
 */
export async function POST(request: Request) {
  try {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) {
      return NextResponse.json(
        { error: "CRON_SECRET is not configured" },
        { status: 503 },
      );
    }

    const auth = request.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token || token !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const result = await runPaymentDueReminders(supabase, { resend: false });
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
