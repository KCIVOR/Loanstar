import { asConfigString } from "@/lib/sms/config-mask";

import type { RenderEngine } from "./index";

/**
 * Resolves the document-renderer engine + Gotenberg connection from the
 * `config_settings` table, falling back to the historical env vars.
 *
 * `config_settings` SELECT is RLS-gated to `system_config` viewers, but the
 * render call sites run as collectors / AR / LRA. So `loadDocRenderConfig`
 * reads through a service client (a global infra-config read — no user data —
 * same pattern as `loadReportsAiConfig(createServiceClient())`). The Supabase
 * client is pulled in via a dynamic import so this module stays safe for
 * node:test + client bundles; keep `parseDocRenderConfig` pure.
 */

export const DOC_RENDER_CONFIG_KEYS = [
  "doc_render_engine",
  "gotenberg_url",
  "gotenberg_basic_auth_user",
  "gotenberg_basic_auth_pass",
] as const;

export type DocRenderConnection = { url: string; user: string; pass: string };

export type ResolvedDocRenderConfig = {
  engine: RenderEngine;
  connection: DocRenderConnection;
  /** true when engine=chromium but no URL is configured (DB or env). */
  misconfigured: boolean;
};

type ConfigRow = { key: string; value: unknown };
type EnvLike = Partial<Record<string, string | undefined>>;

/** Pure resolver — DB rows win over env, env wins over the built-in default. */
export function parseDocRenderConfig(
  rows: ConfigRow[],
  env: EnvLike = process.env,
): ResolvedDocRenderConfig {
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const pick = (key: string, envKey: string): string =>
    asConfigString(map.get(key)).trim() || (env[envKey] ?? "").trim();

  const dbEngine = asConfigString(map.get("doc_render_engine")).trim();
  const envEngine = (env.DOC_RENDER_ENGINE ?? "").trim();
  const engine: RenderEngine =
    dbEngine === "chromium" || dbEngine === "pdfmake"
      ? dbEngine
      : envEngine === "chromium"
        ? "chromium"
        : "pdfmake";

  const connection: DocRenderConnection = {
    url: pick("gotenberg_url", "GOTENBERG_URL").replace(/\/+$/, ""),
    user: pick("gotenberg_basic_auth_user", "GOTENBERG_BASIC_AUTH_USER"),
    pass: pick("gotenberg_basic_auth_pass", "GOTENBERG_BASIC_AUTH_PASS"),
  };

  return {
    engine,
    connection,
    misconfigured: engine === "chromium" && connection.url === "",
  };
}

/**
 * Load + resolve the renderer config. On any read failure (migration not applied,
 * missing service-role env, transient error) this degrades to env-only so
 * rendering never hard-fails because of a config lookup.
 */
export async function loadDocRenderConfig(): Promise<ResolvedDocRenderConfig> {
  try {
    const { createServiceClient } = await import("@/lib/supabase/server");
    const admin = createServiceClient();
    const { data, error } = await admin
      .from("config_settings")
      .select("key, value")
      .in("key", [...DOC_RENDER_CONFIG_KEYS]);
    if (error) throw new Error(error.message);
    return parseDocRenderConfig((data ?? []) as ConfigRow[]);
  } catch {
    return parseDocRenderConfig([]);
  }
}
