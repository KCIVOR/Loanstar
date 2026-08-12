import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { requireModulePermission } from "@/lib/permissions/server";
import {
  asConfigString,
  maskTwilioAuthToken,
  shouldApplySecretPatch,
} from "@/lib/sms/config-mask";
import { createClient } from "@/lib/supabase/server";

const CONFIG_KEYS = [
  "penalty_rate",
  "penalty_rate_sme",
  "coverage_ratio",
  "committee_size",
  "aging_thresholds",
  "sms_enabled",
  "twilio_account_sid",
  "twilio_auth_token",
  "twilio_from_number",
  "app_base_url",
  "cron_secret",
  "email_enabled",
  "smtp_host",
  "smtp_port",
  "smtp_secure",
  "smtp_user",
  "smtp_password",
  "smtp_from",
] as const;

const SECRET_KEYS = new Set(["twilio_auth_token", "cron_secret", "smtp_password"]);

function maskSettings(
  rows: Array<{ key: string; value: unknown; description: string | null; updated_at: string }>,
) {
  return rows.map((row) => {
    if (!SECRET_KEYS.has(row.key)) return row;
    const raw = asConfigString(row.value);
    return {
      ...row,
      value: maskTwilioAuthToken(raw),
    };
  });
}

export async function GET() {
  try {
    await requireModulePermission("system_config", "view");
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("config_settings")
      .select("key, value, description, updated_at")
      .in("key", [...CONFIG_KEYS]);

    if (error) throw new Error(error.message);

    return jsonOk({ settings: maskSettings(data ?? []) });
  } catch (error) {
    return handleApiError(error);
  }
}

const patchConfigSchema = z.object({
  penalty_rate: z.number().min(0).max(1).optional(),
  penalty_rate_sme: z.number().min(0).max(1).optional(),
  coverage_ratio: z.number().min(0).max(1).optional(),
  committee_size: z.number().int().min(1).max(15).optional(),
  aging_thresholds: z
    .object({
      "30": z.number().int().positive(),
      "60": z.number().int().positive(),
      "90": z.number().int().positive(),
    })
    .optional(),
  sms_enabled: z.boolean().optional(),
  twilio_account_sid: z.string().optional(),
  twilio_auth_token: z.string().optional(),
  twilio_from_number: z.string().optional(),
  app_base_url: z.string().optional(),
  cron_secret: z.string().optional(),
  email_enabled: z.boolean().optional(),
  smtp_host: z.string().optional(),
  smtp_port: z.number().int().positive().optional(),
  smtp_secure: z.boolean().optional(),
  smtp_user: z.string().optional(),
  smtp_password: z.string().optional(),
  smtp_from: z.string().optional(),
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
    if (body.penalty_rate_sme !== undefined) {
      updates.push({ key: "penalty_rate_sme", value: body.penalty_rate_sme });
    }
    if (body.coverage_ratio !== undefined) {
      updates.push({ key: "coverage_ratio", value: body.coverage_ratio });
    }
    if (body.committee_size !== undefined) {
      updates.push({ key: "committee_size", value: body.committee_size });
    }
    if (body.aging_thresholds !== undefined) {
      updates.push({ key: "aging_thresholds", value: body.aging_thresholds });
    }
    if (body.sms_enabled !== undefined) {
      updates.push({ key: "sms_enabled", value: body.sms_enabled });
    }
    if (body.twilio_account_sid !== undefined) {
      updates.push({
        key: "twilio_account_sid",
        value: body.twilio_account_sid.trim(),
      });
    }
    if (shouldApplySecretPatch(body.twilio_auth_token)) {
      updates.push({
        key: "twilio_auth_token",
        value: body.twilio_auth_token!.trim(),
      });
    }
    if (body.twilio_from_number !== undefined) {
      updates.push({
        key: "twilio_from_number",
        value: body.twilio_from_number.trim(),
      });
    }
    if (body.app_base_url !== undefined) {
      updates.push({ key: "app_base_url", value: body.app_base_url.trim() });
    }
    if (shouldApplySecretPatch(body.cron_secret)) {
      updates.push({ key: "cron_secret", value: body.cron_secret!.trim() });
    }
    if (body.email_enabled !== undefined) {
      updates.push({ key: "email_enabled", value: body.email_enabled });
    }
    if (body.smtp_host !== undefined) {
      updates.push({ key: "smtp_host", value: body.smtp_host.trim() });
    }
    if (body.smtp_port !== undefined) {
      updates.push({ key: "smtp_port", value: body.smtp_port });
    }
    if (body.smtp_secure !== undefined) {
      updates.push({ key: "smtp_secure", value: body.smtp_secure });
    }
    if (body.smtp_user !== undefined) {
      updates.push({ key: "smtp_user", value: body.smtp_user.trim() });
    }
    if (shouldApplySecretPatch(body.smtp_password)) {
      updates.push({
        key: "smtp_password",
        value: body.smtp_password!.trim(),
      });
    }
    if (body.smtp_from !== undefined) {
      updates.push({ key: "smtp_from", value: body.smtp_from.trim() });
    }

    for (const update of updates) {
      // Upsert so missing keys (e.g. SMTP before migration) still persist —
      // plain UPDATE matched 0 rows and failed silently.
      const { error, data } = await supabase
        .from("config_settings")
        .upsert(
          {
            key: update.key,
            value: update.value,
            updated_by: user.id,
          },
          { onConflict: "key" },
        )
        .select("key");
      if (error) throw new Error(error.message);
      if (!data?.length) {
        throw new Error(`Failed to save config key '${update.key}'`);
      }
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
      afterData: {
        settings: (afterRows ?? []).map((row) =>
          SECRET_KEYS.has(row.key as string)
            ? { ...row, value: "[redacted]" }
            : row,
        ),
      },
    });

    return jsonOk({ settings: maskSettings(afterRows ?? []) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
