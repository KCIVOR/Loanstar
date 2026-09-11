import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { htmlToPdfViaGotenberg, RenderEngineError } from "@/lib/documents/render";
import { loadDocRenderConfig } from "@/lib/documents/render/engine-config";
import { requireModulePermission } from "@/lib/permissions/server";

// Uses jsdom-free Gotenberg fetch, but keep it off Edge for parity with render.
export const runtime = "nodejs";

/**
 * Connectivity check for the admin Config page. Renders a one-line HTML document
 * through the saved Gotenberg URL + basic-auth creds and confirms a PDF comes
 * back. Save the config first — this reads from `config_settings`, not the
 * unsaved form inputs (same contract as the LoanBot test).
 */
export async function POST() {
  try {
    const user = await requireModulePermission("system_config", "edit");
    const cfg = await loadDocRenderConfig();

    if (!cfg.connection.url) {
      return NextResponse.json(
        { error: "Save a Gotenberg URL first, then test." },
        { status: 400 },
      );
    }

    const started = Date.now();
    const pdf = await htmlToPdfViaGotenberg(
      "<p>Loanstar Gotenberg connectivity check.</p>",
      { connection: cfg.connection },
    );
    const ms = Date.now() - started;

    const ok = pdf.byteLength > 4 && pdf[0] === 0x25 && pdf[1] === 0x50; // "%P"
    if (!ok) {
      return NextResponse.json(
        { error: "Gotenberg responded but did not return a PDF." },
        { status: 400 },
      );
    }

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "system_config",
      action: "execute_trigger",
      entityType: "gotenberg_test",
      afterData: { ok: true, bytes: pdf.byteLength, ms },
    });

    return jsonOk({ ok: true, bytes: pdf.byteLength, ms });
  } catch (error) {
    if (error instanceof RenderEngineError) {
      return NextResponse.json(
        { error: `${error.message}${error.detail ? ` — ${error.detail}` : ""}` },
        { status: 400 },
      );
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
