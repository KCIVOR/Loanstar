import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError } from "@/lib/api/handler";
import { renderTemplateToDocx } from "@/lib/documents/render/docx";
import { buildSampleContext } from "@/lib/documents/templates/fields";
import { requireModulePermission } from "@/lib/permissions/server";

// html-to-docx is Node-only (Buffer / zlib); never Edge.
export const runtime = "nodejs";

const schema = z.object({
  body: z.string().max(200_000),
  /** true → fill {{tokens}} with sample data; false → keep the template as-is. */
  merged: z.boolean().optional(),
});

/**
 * Render a template body to a `.docx` for offline editing. Superadmin /
 * system_config only. An editable copy — not the canonical (PDF) output.
 */
export async function POST(request: Request) {
  try {
    await requireModulePermission("system_config", "view");
    const { body, merged } = schema.parse(await request.json());

    const docx = await renderTemplateToDocx(body, {
      merge: merged ? buildSampleContext() : undefined,
    });

    return new NextResponse(new Uint8Array(docx), {
      status: 200,
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "content-disposition": 'attachment; filename="template.docx"',
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
