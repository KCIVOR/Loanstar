import { JSDOM } from "jsdom";

export type RenderContext = Record<string, unknown>;

const TOKEN = /\{\{\s*([\w.]+)\s*\}\}/g;

/** Resolve a dotted path (`borrower.firstName`) against the context. */
function lookup(ctx: RenderContext, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as object)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, ctx);
}

function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Replace every `{{ path }}` token in a string with its HTML-escaped value.
 * Unknown paths resolve to an empty string so raw tokens never leak into output.
 * Values are always escaped — template fields are data, not markup.
 */
function replaceTokens(text: string, ctx: RenderContext): string {
  return text.replace(TOKEN, (_match, path: string) =>
    escapeHtml(lookup(ctx, path)),
  );
}

function isTruthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}

/**
 * Merge a template HTML string with a data context. Supported constructs
 * (chosen to survive WYSIWYG editing — attributes, not fragile inline syntax):
 *
 *   {{ path.to.value }}        scalar token, HTML-escaped
 *   data-repeat="collection"   clones the element once per array item;
 *                              inner tokens resolve item-first, then root
 *   data-if="path"             element removed when the value is falsy/empty
 *   data-unless="path"         element removed when the value is truthy
 *
 * Returns merged HTML ready for the PDF renderer. This is the only place that
 * interprets template syntax; the renderer treats its output as plain HTML.
 */
export function mergeTemplate(html: string, context: RenderContext): string {
  const dom = new JSDOM(`<body>${html}</body>`);
  const { document } = dom.window;

  // Conditionals first, so we never expand repeats inside a removed branch.
  for (const el of Array.from(document.querySelectorAll("[data-if]"))) {
    if (!isTruthy(lookup(context, el.getAttribute("data-if") ?? ""))) {
      el.remove();
    } else {
      el.removeAttribute("data-if");
    }
  }
  for (const el of Array.from(document.querySelectorAll("[data-unless]"))) {
    if (isTruthy(lookup(context, el.getAttribute("data-unless") ?? ""))) {
      el.remove();
    } else {
      el.removeAttribute("data-unless");
    }
  }

  // Repeats: replace each template element with N fully-resolved clones.
  for (const tpl of Array.from(document.querySelectorAll("[data-repeat]"))) {
    const collection = lookup(context, tpl.getAttribute("data-repeat") ?? "");
    const items = Array.isArray(collection) ? collection : [];
    const rows = items
      .map((item) => {
        const itemCtx: RenderContext =
          item && typeof item === "object"
            ? { ...context, ...(item as RenderContext) }
            : { ...context, value: item };
        const raw = tpl.outerHTML.replace(/\s+data-repeat="[^"]*"/, "");
        return replaceTokens(raw, itemCtx);
      })
      .join("");
    tpl.insertAdjacentHTML("beforebegin", rows);
    tpl.remove();
  }

  // Remaining root-scope scalar tokens (text and attributes alike live in the
  // serialized innerHTML). Repeat clones are already resolved, so no double pass.
  return replaceTokens(document.body.innerHTML, context);
}
