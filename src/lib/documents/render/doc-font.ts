import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The document font attached to every Gotenberg request, so the rendered PDF is
 * identical regardless of what fonts the Gotenberg container image happens to
 * ship. `PRINT_CSS` declares `@font-face { src: url("fonts/doc.woff2") }` and
 * `gotenberg.ts` uploads these bytes under that name.
 *
 * The file is optional: until `assets/doc.woff2` is committed, the Chromium path
 * still works — Chromium just falls back to its bundled sans-serif. Provide the
 * file per `infra/gotenberg/README.md §2` (Liberation Sans, WOFF2).
 */

const FONT_PATH = join(process.cwd(), "src/lib/documents/render/assets/doc.woff2");

let cached: Uint8Array | null | undefined;

export function loadDocFont(): Uint8Array | null {
  if (cached !== undefined) return cached;
  try {
    cached = new Uint8Array(readFileSync(FONT_PATH));
  } catch {
    cached = null;
  }
  return cached;
}
