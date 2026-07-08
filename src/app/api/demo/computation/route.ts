import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, jsonOk } from "@/lib/api/handler";
import { validateFieldEdit } from "@/lib/permissions/field-rules";
import type { ModuleSlug } from "@/lib/permissions/types";
import { requireAuth } from "@/lib/permissions/server";

const patchSchema = z.object({
  computation: z.record(z.string(), z.unknown()).optional(),
});

const COMPUTATION_MODULES: ModuleSlug[] = ["computation", "verification"];

/**
 * Demo endpoint: rejects PATCH when user has read_only on computation fields.
 */
export async function PATCH(request: Request) {
  try {
    const user = await requireAuth();
    const body = patchSchema.parse(await request.json());

    if (body.computation !== undefined) {
      for (const moduleSlug of COMPUTATION_MODULES) {
        const result = await validateFieldEdit(
          moduleSlug,
          "computation",
          user.id,
        );
        if (!result.allowed) {
          return NextResponse.json({ error: result.reason }, { status: 403 });
        }
      }

      for (const field of Object.keys(body.computation)) {
        for (const moduleSlug of COMPUTATION_MODULES) {
          const result = await validateFieldEdit(
            moduleSlug,
            field,
            user.id,
          );
          if (!result.allowed) {
            return NextResponse.json({ error: result.reason }, { status: 403 });
          }
        }
      }
    }

    return jsonOk({
      success: true,
      message: "Computation fields updated (demo)",
      data: body,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
