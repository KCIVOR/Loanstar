import type { SupabaseClient } from "@supabase/supabase-js";

import {
  asConfigBoolean,
  asConfigString,
} from "@/lib/sms/config-mask";

export const REPORTS_AI_CONFIG_KEYS = [
  "reports_ai_enabled",
  "reports_ai_api_key",
  "reports_ai_model",
] as const;

export type ConfigRow = { key: string; value: unknown };

export type ParsedReportsAiConfig = {
  enabled: boolean;
  apiKey: string;
  model: string;
  incomplete: string[];
  /** enabled && apiKey present — safe to call OpenAI */
  ready: boolean;
};

export function parseReportsAiConfig(rows: ConfigRow[]): ParsedReportsAiConfig {
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const enabled = asConfigBoolean(map.get("reports_ai_enabled"), false);
  const apiKey = asConfigString(map.get("reports_ai_api_key")).trim();
  const model = asConfigString(map.get("reports_ai_model")).trim() || "gpt-4o-mini";
  const incomplete: string[] = [];
  if (!apiKey) incomplete.push("reports_ai_api_key");
  return {
    enabled,
    apiKey,
    model,
    incomplete,
    ready: enabled && incomplete.length === 0,
  };
}

export async function loadReportsAiConfig(
  supabase: SupabaseClient,
): Promise<ParsedReportsAiConfig> {
  const { data, error } = await supabase
    .from("config_settings")
    .select("key, value")
    .in("key", [...REPORTS_AI_CONFIG_KEYS]);
  if (error) throw new Error(`Failed to load reports AI config: ${error.message}`);
  return parseReportsAiConfig(data ?? []);
}
