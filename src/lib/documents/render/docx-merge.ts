import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

/**
 * Fills merge-field tags directly inside an uploaded .docx (scalar
 * `{{field}}`; `{{#field}}...{{/field}}` for both loops over an array field
 * and conditionals on a truthy scalar field — docxtemplater has no separate
 * `{{#if}}` keyword, a non-array truthy value under a repeated open/close
 * tag name just shows once, same as a one-item loop). Delimiters configured
 * below as `{{`/`}}` (docxtemplater's own default is single-brace `{`/`}`)
 * to match this app's existing HTML merge system in merge.ts. Loops/
 * conditionals are still inline text-marker pairs inside the Word XML rather
 * than DOM attributes, so they can't be authored the same way as
 * `data-repeat`/`data-if` — see the "Upload a Word file as template" plan.
 * Preserves 100% of the source file's own layout/fonts/spacing, since
 * nothing is redrawn — only text runs matching a tag are replaced.
 *
 * `context` is the same flat Record<string, unknown> buildReleaseTemplateContext
 * already produces (template-context.ts) — no format-specific context shape,
 * array fields like `vehicles` work directly as docxtemplater loop sources.
 *
 * Throws DocxTemplateMergeError with a readable, tag-specific message on any
 * unresolved/malformed tag (docxtemplater's own error objects name the exact
 * tag and location) rather than letting a cryptic library error surface.
 */
export class DocxTemplateMergeError extends Error {
  constructor(
    message: string,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = "DocxTemplateMergeError";
  }
}

export function mergeDocxTemplate(
  docxBytes: Buffer | Uint8Array,
  context: Record<string, unknown>,
): Buffer {
  let zip: PizZip;
  try {
    zip = new PizZip(docxBytes);
  } catch (error) {
    throw new DocxTemplateMergeError(
      `Uploaded file is not a valid .docx (could not open as a zip archive): ${
        error instanceof Error ? error.message : String(error)
      }`,
      error,
    );
  }

  let doc: Docxtemplater;
  try {
    doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      // Match this app's existing `{{field}}` merge-field convention (see
      // merge.ts's TOKEN regex) — docxtemplater's own default is single-brace
      // `{`/`}`, which would parse `{{field}}` as a nested/duplicate tag.
      delimiters: { start: "{{", end: "}}" },
    });
  } catch (error) {
    throw new DocxTemplateMergeError(
      `Uploaded file could not be loaded as a Word document template: ${extractDocxtemplaterErrorDetail(error)}`,
      error,
    );
  }

  try {
    doc.render(context);
  } catch (error) {
    const detail = extractDocxtemplaterErrorDetail(error);
    throw new DocxTemplateMergeError(
      `Template tag error: ${detail}`,
      error,
    );
  }

  return doc.getZip().generate({ type: "nodebuffer" }) as Buffer;
}

/** docxtemplater throws a RenderingError/TemplateError with a `properties`
 * object (id, explanation, xtag, offset, ...) rather than a plain Error
 * message for template-authoring mistakes — surface the useful parts instead
 * of "[object Object]" or a generic stack trace. Falls back to the plain
 * error message for anything else (e.g. a genuine bug, not a bad tag). */
function extractDocxtemplaterErrorDetail(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "properties" in error &&
    error.properties &&
    typeof error.properties === "object"
  ) {
    const properties = error.properties as Record<string, unknown>;
    // A `multi_error` (id === "multi_error") wraps several real errors in
    // `properties.errors`, each with its OWN specific `.properties.explanation`
    // — its own top-level `explanation` is just "The template has multiple
    // errors", so the array must be checked first or every multi-tag mistake
    // reports that one useless generic line instead of naming any of them.
    if (
      Array.isArray(properties.errors) &&
      properties.errors.length > 0
    ) {
      return properties.errors
        .map((entry) => {
          const props =
            entry && typeof entry === "object" && "properties" in entry
              ? (entry.properties as Record<string, unknown>)
              : null;
          const msg = props && typeof props.explanation === "string" ? props.explanation : null;
          const tag = props && typeof props.xtag === "string" ? props.xtag : null;
          return msg ? (tag ? `${msg} (tag: ${tag})` : msg) : String(entry);
        })
        .join("; ");
    }

    const explanation =
      typeof properties.explanation === "string" ? properties.explanation : null;
    const xtag = typeof properties.xtag === "string" ? properties.xtag : null;
    if (explanation) {
      return xtag ? `${explanation} (tag: ${xtag})` : explanation;
    }
  }
  return error instanceof Error ? error.message : String(error);
}
