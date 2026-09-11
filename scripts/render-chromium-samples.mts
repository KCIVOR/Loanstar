/**
 * Render a few published templates through the chromium engine to eyeball the
 * new house layout. Run from the repo root:
 *   npx tsx --env-file=.env.local scripts/render-chromium-samples.mts
 */
import { mkdirSync, writeFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { renderTemplateToPdf } from "../src/lib/documents/render/index.js";
import { loadDocRenderConfig } from "../src/lib/documents/render/engine-config.js";
import { buildSampleContext } from "../src/lib/documents/templates/fields.js";

const SLUGS = ["promissory_note", "loan_agreement", "disclosure_statement", "demand_letter"];

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const cfg = await loadDocRenderConfig();
console.log("engine:", cfg.engine, "url:", cfg.connection.url || "(none)");

for (const slug of SLUGS) {
  const { data, error } = await supabase
    .from("document_templates")
    .select("id, name, document_template_versions!inner(body, status)")
    .eq("slug", slug)
    .eq("document_template_versions.status", "published")
    .maybeSingle();
  if (error || !data) {
    console.log(`skip ${slug}: ${error?.message ?? "no published version"}`);
    continue;
  }
  const body = (data.document_template_versions as unknown as Array<{ body: string }>)[0].body;
  const pdf = await renderTemplateToPdf(body, buildSampleContext(), {
    engine: "chromium",
    connection: cfg.connection,
  });
  mkdirSync("_snapshots", { recursive: true });
  const out = `_snapshots/sample-${slug}.pdf`;
  writeFileSync(out, pdf);
  console.log(`${slug}: ${pdf.byteLength} bytes -> ${out}`);
}
