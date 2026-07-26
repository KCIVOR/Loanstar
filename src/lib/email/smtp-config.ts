import type { SupabaseClient } from "@supabase/supabase-js";

import {
  asConfigBoolean,
  asConfigString,
} from "@/lib/sms/config-mask";

export const SMTP_CONFIG_KEYS = [
  "email_enabled",
  "smtp_host",
  "smtp_port",
  "smtp_secure",
  "smtp_user",
  "smtp_password",
  "smtp_from",
] as const;

export type SmtpConfigRow = { key: string; value: unknown };

export type ParsedSmtpConfig = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  /** Missing required field names when checking completeness. */
  incomplete: string[];
};

function asConfigNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export function parseSmtpConfig(rows: SmtpConfigRow[]): ParsedSmtpConfig {
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const enabled = asConfigBoolean(map.get("email_enabled"), false);
  const host = asConfigString(map.get("smtp_host")).trim();
  const port = asConfigNumber(map.get("smtp_port"), 587);
  const secure = asConfigBoolean(map.get("smtp_secure"), false);
  const user = asConfigString(map.get("smtp_user")).trim();
  const password = asConfigString(map.get("smtp_password")).trim();
  const from = asConfigString(map.get("smtp_from")).trim();

  const incomplete: string[] = [];
  if (!host) incomplete.push("smtp_host");
  if (!user) incomplete.push("smtp_user");
  if (!password) incomplete.push("smtp_password");
  if (!from) incomplete.push("smtp_from");

  return { enabled, host, port, secure, user, password, from, incomplete };
}

export async function loadSmtpConfig(
  supabase: SupabaseClient,
): Promise<ParsedSmtpConfig> {
  const { data, error } = await supabase
    .from("config_settings")
    .select("key, value")
    .in("key", [...SMTP_CONFIG_KEYS]);

  if (error) {
    throw new Error(`Failed to load SMTP config: ${error.message}`);
  }
  return parseSmtpConfig(data ?? []);
}
