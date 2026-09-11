import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The document font attached to every Gotenberg request, so the rendered PDF is
 * identical regardless of what fonts the Gotenberg container image ships and
 * matches the editor preview (which uses the same `@font-face`).
 *
 * `assets/doc.woff2` + `assets/doc-bold.woff2` are Tinos (Apache-2.0), which is
 * metric-compatible with Times New Roman — the LSLGC source-document face.
 * `PRINT_CSS` declares the matching `@font-face` rules against `fonts/<name>`.
 *
 * Both files are optional: if absent, Chromium falls back down the CSS stack
 * ("Times New Roman" → "Liberation Serif" on the Gotenberg container).
 */

export type DocFontFile = { filename: string; bytes: Uint8Array };

const ASSET_DIR = join(process.cwd(), "src/lib/documents/render/assets");

const FILES: Array<{ asset: string; filename: string }> = [
  { asset: "doc.woff2", filename: "fonts/doc.woff2" },
  { asset: "doc-bold.woff2", filename: "fonts/doc-bold.woff2" },
];

let cached: DocFontFile[] | undefined;

export function loadDocFonts(): DocFontFile[] {
  if (cached !== undefined) return cached;
  const out: DocFontFile[] = [];
  for (const f of FILES) {
    try {
      out.push({
        filename: f.filename,
        bytes: new Uint8Array(readFileSync(join(ASSET_DIR, f.asset))),
      });
    } catch {
      // asset not bundled — skip, CSS fallback covers it
    }
  }
  cached = out;
  return cached;
}
