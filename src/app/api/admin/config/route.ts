import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

const CONFIG_KEYS = ["penalty_rate", "coverage_ratio", "aging_thresholds"] as const;

export async function GET() {
  try {
    await requireModulePermission("system_config", "view");
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("config_settings")
      .select("key, value, description, updated_at")
      .in("key", [...CONFIG_KEYS]);

    if (error) throw new Error(error.message);

    return jsonOk({ settings: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}

const patchConfigSchema = z.object({
  penalty_rate: z.number().min(0).max(1).optional(),
  coverage_ratio: z.number().min(0).max(1).optional(),
  aging_thresholds: z
    .object({
      "30": z.number().int().positive(),
      "60": z.number().int().positive(),
      "90": z.number().int().positive(),
    })
    .optional(),
});

export async function PATCH(request: Request) {
  try {
    const user = await requireModulePermission("system_config", "edit");
    const body = patchConfigSchema.parse(await request.json());
    const supabase = await createClient();

    const { data: beforeRows } = await supabase
      .from("config_settings")
      .select("key, value")
      .in("key", [...CONFIG_KEYS]);

    const updates: Array<{ key: string; value: unknown }> = [];
    if (body.penalty_rate !== undefined) {
      updates.push({ key: "penalty_rate", value: body.penalty_rate });
    }
    if (body.coverage_ratio !== undefined) {
      updates.push({ key: "coverage_ratio", value: body.coverage_ratio });
    }
    if (body.aging_thresholds !== undefined) {
      updates.push({ key: "aging_thresholds", value: body.aging_thresholds });
    }

    for (const update of updates) {
      const { error } = await supabase
        .from("config_settings")
        .update({
          value: update.value,
          updated_by: user.id,
        })
        .eq("key", update.key);
      if (error) throw new Error(error.message);
    }

    const { data: afterRows } = await supabase
      .from("config_settings")
      .select("key, value, description, updated_at")
      .in("key", [...CONFIG_KEYS]);

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "system_config",
      action: "update",
      entityType: "config_settings",
      beforeData: { settings: beforeRows },
      afterData: { settings: afterRows },
    });

    return jsonOk({ settings: afterRows ?? [] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
