import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { requireModulePermission } from "@/lib/permissions/server";
import { loadReportsAiConfig } from "@/lib/reports/assistant/config";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const user = await requireModulePermission("system_config", "edit");
    const supabase = createServiceClient();
    const cfg = await loadReportsAiConfig(supabase);
    if (!cfg.apiKey) {
      return NextResponse.json(
        { error: "Save an OpenAI API key first, then test." },
        { status: 400 },
      );
    }
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: "user", content: "Reply with the single word pong." }],
        max_tokens: 8,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json(
        { error: `OpenAI error HTTP ${res.status}: ${body.slice(0, 200)}` },
        { status: 400 },
      );
    }
    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "system_config",
      action: "execute_trigger",
      entityType: "reports_ai_test",
      afterData: { ok: true, model: cfg.model },
    });
    return jsonOk({ ok: true, model: cfg.model });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
