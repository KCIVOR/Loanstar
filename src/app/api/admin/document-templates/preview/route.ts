import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError } from "@/lib/api/handler";
import { renderTemplateToPdf } from "@/lib/documents/render";
import { buildSampleContext } from "@/lib/documents/templates/fields";
import { requireModulePermission } from "@/lib/permissions/server";

// jsdom + pdfmake are Node-only (Buffer, no browser); never run this on Edge.
export const runtime = "nodejs";

const previewSchema = z.object({
  body: z.string().max(200_000),
});

/**
 * Render a template draft to a PDF using sample data, for the editor preview.
 * Superadmin/system_config only. Renders in an offline jsdom (no resource
 * loading), so template HTML cannot trigger network requests.
 */
export async function POST(request: Request) {
  try {
    await requireModulePermission("system_config", "view");
    const { body } = previewSchema.parse(await request.json());

    const pdf = await renderTemplateToPdf(body, buildSampleContext());

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": "inline; filename=preview.pdf",
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
