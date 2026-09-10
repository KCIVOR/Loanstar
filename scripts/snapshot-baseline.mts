/**
 * Phase 0: Baseline verification — snapshot current PDF output
 * 
 * Captures the byte-exact output of all published templates so Phase 2 can
 * prove they're unchanged. Also verifies determinism (same input → same hash).
 * 
 * Usage:
 *   npx tsx --env-file=.env.local scripts/snapshot-baseline.mts
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { renderTemplateToPdf } from "../src/lib/documents/render/index.js";
import { buildSampleContext } from "../src/lib/documents/templates/fields.js";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — run with --env-file=.env.local",
  );
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SNAPSHOTS_DIR = "_snapshots";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashPdf(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("📸 Phase 0: Baseline Verification — Snapshotting PDFs\n");

  // Step 1: Query all published templates
  console.log("🔍 Querying published templates...");
  const { data: templates, error } = await supabase
    .from("document_template_versions")
    .select(`
      id,
      version_no,
      body,
      template:document_templates!inner(slug, name)
    `)
    .eq("status", "published")
    .order("template(slug)");

  if (error) {
    throw new Error(`Failed to query templates: ${error.message}`);
  }

  if (!templates || templates.length === 0) {
    throw new Error("No published templates found in database");
  }

  console.log(`✓ Found ${templates.length} published templates\n`);

  // Step 2: Create snapshots directory
  await mkdir(SNAPSHOTS_DIR, { recursive: true });

  // Step 3: Render each template and verify determinism
  const sampleContext = buildSampleContext();
  const hashes: Record<string, { version: number; hash: string; size: number }> = {};

  for (let i = 0; i < templates.length; i++) {
    const template = templates[i];
    const slug = (template.template as any).slug;
    const name = (template.template as any).name;
    const version = template.version_no;

    console.log(`[${i + 1}/${templates.length}] ${slug} (v${version}): ${name}`);

    // First render
    const pdf1 = await renderTemplateToPdf(template.body, sampleContext);
    const hash1 = hashPdf(pdf1);
    console.log(`  → First render:  ${hash1.substring(0, 12)}... (${formatBytes(pdf1.length)})`);

    // Second render (determinism check)
    const pdf2 = await renderTemplateToPdf(template.body, sampleContext);
    const hash2 = hashPdf(pdf2);
    console.log(`  → Second render: ${hash2.substring(0, 12)}...`);

    if (hash1 !== hash2) {
      throw new Error(
        `❌ NON-DETERMINISTIC: ${slug} produced different hashes!\n` +
        `   First:  ${hash1}\n` +
        `   Second: ${hash2}`
      );
    }

    console.log(`  ✓ Deterministic (hashes match)`);

    // Save PDF
    const filename = `template-${slug}-v${version}.pdf`;
    const filepath = join(SNAPSHOTS_DIR, filename);
    await writeFile(filepath, pdf1);
    console.log(`  ✓ Saved: ${filename}\n`);

    // Record hash
    hashes[slug] = {
      version,
      hash: hash1,
      size: pdf1.length,
    };
  }

  // Step 4: Write hash manifest
  const manifestPath = join(SNAPSHOTS_DIR, "baseline-hashes.json");
  const manifest = {
    generated_at: new Date().toISOString(),
    template_count: templates.length,
    templates: hashes,
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`✅ Hash manifest saved: ${manifestPath}`);

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("✅ BASELINE SNAPSHOT COMPLETE");
  console.log("=".repeat(60));
  console.log(`Templates snapshotted: ${templates.length}`);
  console.log(`All renders were deterministic (same input → same hash)`);
  console.log(`\nFiles created:`);
  console.log(`  - ${SNAPSHOTS_DIR}/baseline-hashes.json`);
  console.log(`  - ${SNAPSHOTS_DIR}/template-*.pdf (${templates.length} files)`);
  console.log("\n💡 Next: Document Visual editor CSS and commit to git");
}

main().catch((err) => {
  console.error("\n❌ ERROR:", err.message);
  process.exit(1);
});
