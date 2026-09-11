import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The company wordmark as a base64 `data:` URI, injected into every render
 * context as `{{logoDataUri}}` so a template can place the logo inline
 * (`<img class="doc-logo" src="{{logoDataUri}}">`, via the editor's "Company
 * logo" palette button) wherever the source document has it.
 *
 * A data URI (not a URL) so it renders in all three places without a network
 * fetch: the pdfmake engine (pdfmake needs base64 images), the Gotenberg
 * container (network-denied), and the editor's Preview PDF.
 *
 * Source: the bundled `assets/letterhead-logo.png` (trimmed from the LSLGC
 * source docs' own `image1.jpeg`). Optional — resolves to `""` if absent, which
 * just yields a broken `<img>` the author can notice.
 */

const LOGO_PATH = join(
  process.cwd(),
  "src/lib/documents/render/assets/letterhead-logo.png",
);

let cached: string | undefined;

export function getLogoDataUri(): string {
  if (cached !== undefined) return cached;
  try {
    cached = `data:image/png;base64,${readFileSync(LOGO_PATH).toString("base64")}`;
  } catch {
    cached = "";
  }
  return cached;
}
