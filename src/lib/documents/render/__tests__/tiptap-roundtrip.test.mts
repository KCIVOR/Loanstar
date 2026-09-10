import test from "node:test";
import assert from "node:assert/strict";

import { generateHTML, generateJSON } from "@tiptap/html";

import { templateExtensions } from "@/components/admin/template-editor/extensions";
import { mergeTemplate } from "@/lib/documents/render/merge";
import { buildSampleContext } from "@/lib/documents/templates/fields";

import { FIXTURES } from "./tiptap-roundtrip.fixtures";

/**
 * The correctness gate for the editor swap: loading a template body into the
 * TipTap schema and re-serialising it must produce HTML that `mergeTemplate`
 * renders **identically** — same tokens resolved, same repeat/conditional
 * behaviour, same structure (whitespace + attribute formatting normalised).
 *
 * A byte-identical HTML round-trip is NOT required; a *semantically equivalent*
 * merged output is. Any fixture that only differs cosmetically (e.g. a wrapper
 * element collapsed) is still a pass; a fixture where a token is lost, a
 * conditional/repeat is dropped, or content is reordered is a FAIL.
 */

const exts = templateExtensions();

function roundTrip(html: string): string {
  const json = generateJSON(html, exts);
  return generateHTML(json, exts);
}

/**
 * Collapse rendering-inert differences so *structural* equality is what's
 * compared: whitespace, the <strong>/<em>/<s> vs <b>/<i> tag choice, the
 * `text-align: X` vs `text-align:X` spacing, and TipTap's colgroup / colspan="1"
 * / rowspan="1" table noise (all ignored identically by Chromium).
 */
function norm(html: string): string {
  return (
    html
      .replace(/\r\n?/g, "\n")
      .replace(/<\/?strong>/g, (m) => (m[1] === "/" ? "</b>" : "<b>"))
      .replace(/<\/?em>/g, (m) => (m[1] === "/" ? "</i>" : "<i>"))
      .replace(/<colgroup>.*?<\/colgroup>/g, "")
      .replace(/ (?:colspan|rowspan)="1"/g, "")
      // <img>: TipTap re-emits attributes in schema order (class last); attribute
      // order is rendering-inert, so canonicalise by sorting.
      .replace(/<img\b([^>]*?)\s*\/?>/g, (_m, a) => {
        const parts = (String(a).match(/[\w-]+="[^"]*"/g) ?? []).sort();
        return `<img ${parts.join(" ")}>`;
      })
      // alignment: `style="text-align:X"` and `data-align="X"` are equivalent —
      // PRINT_CSS turns the latter into the former. Canonicalise to data-align.
      .replace(
        / style="[^"]*text-align:\s*(left|right|center|justify)[^"]*"/g,
        ' data-align="$1"',
      )
      // TipTap's serialiser strips ALL other inline `style` (XSS) and legacy
      // table presentation attrs; PRINT_CSS is the styling authority, so these
      // are rendering-inert. Strip them from both sides before comparing.
      .replace(/ style="[^"]*"/g, "")
      .replace(/ (?:border|cellpadding|cellspacing|align|valign|width|height)="[^"]*"/g, "")
      // list items: `<li>X</li>` and `<li><p>X</p></li>` render the same.
      .replace(/<li>\s*<p>/g, "<li>")
      .replace(/<\/p>\s*<\/li>/g, "</li>")
      // whitespace right after <br> collapses to nothing in HTML rendering;
      // TipTap's parser drops it, JSDOM's innerHTML keeps the source newline.
      .replace(/<br>\s+/g, "<br>")
      // leading/trailing whitespace *inside* a block element is collapsed by the
      // browser; TipTap trims it, JSDOM keeps the source indentation.
      .replace(/(<(?:p|h[1-6]|li|td|th|div)\b[^>]*>)\s+/g, "$1")
      .replace(/\s+(<\/(?:p|h[1-6]|li|td|th|div)>)/g, "$1")
      .replace(/;\s*"/g, '"')
      .replace(/>\s+</g, "><")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function mergedEqual(original: string, tolerant = false): void {
  const ctx = buildSampleContext();
  const before = norm(mergeTemplate(original, ctx));
  const after = norm(mergeTemplate(roundTrip(original), ctx));
  if (tolerant) {
    // strip *all* tags — compares the visible text + order only.
    const text = (s: string) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    assert.equal(text(after), text(before));
  } else {
    assert.equal(after, before);
  }
}

for (const [name, body] of Object.entries(FIXTURES)) {
  test(`round-trip (merged-equivalent): ${name}`, () => {
    mergedEqual(body);
  });
}

/**
 * Opt-in: run the same check against EVERY live published template body.
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL) set.
 */
const LIVE =
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL);

test("round-trip: every live published template body", { skip: !LIVE }, async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL)!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await sb
    .from("document_templates")
    .select("slug, document_template_versions!inner(body, status)")
    .eq("document_template_versions.status", "published")
    .order("slug");
  if (error) throw error;

  const ctx = buildSampleContext();
  const failures: string[] = [];
  for (const row of data ?? []) {
    const slug = (row as { slug: string }).slug;
    const body = (row as { document_template_versions: { body: string }[] })
      .document_template_versions[0].body;
    const before = norm(mergeTemplate(body, ctx));
    const after = norm(mergeTemplate(roundTrip(body), ctx));
    if (before !== after) failures.push(slug);
  }
  assert.deepEqual(failures, [], `templates whose merged output changed: ${failures.join(", ")}`);
});
