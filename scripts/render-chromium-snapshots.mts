/**
 * Phase 3 verification — render every published template via the Chromium
 * (Gotenberg) engine with sample data, into `_snapshots/chromium/`.
 *
 * Requires a deployed Gotenberg AND live Supabase creds:
 *
 *   GOTENBERG_URL=https://loanstar-gotenberg.fly.dev \
 *   GOTENBERG_BASIC_AUTH_USER=loanstar GOTENBERG_BASIC_AUTH_PASS=… \
 *   npx tsx --env-file=.env.local scripts/render-chromium-snapshots.mts
 *
 * Not committed to the test suite. Delete `_snapshots/` after the visual review.
 */
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";

import { hashPdf, renderTemplateToPdf } from "../src/lib/documents/render/index.js";
import { buildSampleContext } from "../src/lib/documents/templates/fields.js";

if (!process.env.GOTENBERG_URL) throw new Error("set GOTENBERG_URL");
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const OUT = "_snapshots/chromium";
await mkdir(OUT, { recursive: true });

const { data, error } = await supabase
  .from("document_templates")
  .select("slug, is_active, document_template_versions!inner(body, status)")
  .eq("is_active", true)
  .eq("document_template_versions.status", "published")
  .order("slug");
if (error) throw error;

const ctx = buildSampleContext();
let ok = 0;
let bad = 0;
for (const t of data ?? []) {
  const slug = (t as { slug: string }).slug;
  const body = (t as { document_template_versions: { body: string }[] })
    .document_template_versions[0].body;
  try {
    const pdf = await renderTemplateToPdf(body, ctx, { engine: "chromium" });
    await writeFile(`${OUT}/${slug}.pdf`, pdf);
    console.log(`✅ ${slug.padEnd(38)} ${pdf.length} B  ${hashPdf(pdf).slice(0, 12)}`);
    ok += 1;
  } catch (e) {
    console.error(`❌ ${slug.padEnd(38)} ${(e as Error).message}`);
    bad += 1;
  }
}
console.log(`\n${ok} rendered, ${bad} failed → ${OUT}/`);
if (bad > 0) process.exit(1);
