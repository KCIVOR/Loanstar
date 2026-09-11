import { Extension, Mark, Node, mergeAttributes } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";

/**
 * Document-template editor schema. Deliberately close to the HTML the published
 * templates already use, so loading + re-serialising a template yields HTML that
 * `mergeTemplate` renders identically.
 *
 * Round-trip decisions (see tiptap-roundtrip.test.mts):
 *   - Bold/Italic serialise as <strong>/<em>; the test treats those as
 *     equivalent to the templates' <b>/<i> (identical rendering).
 *   - Alignment travels as a `data-align` attribute (TipTap's serialiser strips
 *     inline `style`); PRINT_CSS maps `[data-align]` back to `text-align`, and
 *     legacy `style="text-align:…"` templates keep working unchanged.
 *   - Table cells hold inline content (`inline*`) — the templates' cells are
 *     `____<br/><b>{{x}}</b>` style, never multi-paragraph.
 *   - colspan/rowspan are omitted when 1.
 *   - {{token}} stays plain text (no node).
 *
 * Pure JS — safe to import in Node.
 */

// ---------------------------------------------------------------------------
// text alignment
//
// TipTap's HTML serialiser strips inline `style` for XSS safety, so
// `style="text-align:…"` cannot survive a round-trip. Instead we carry
// alignment as a `data-align` attribute (which does round-trip), and PRINT_CSS
// turns `[data-align]` into real `text-align`. `mergeTemplate` also normalises
// legacy `style="text-align:…"` -> `data-align` so untouched templates match.
// ---------------------------------------------------------------------------
function parseAlign(el: HTMLElement): string | null {
  const da = el.getAttribute("data-align");
  if (da) return da;
  const m = /text-align:\s*(left|right|center|justify)/i.exec(
    el.getAttribute("style") ?? "",
  );
  return m ? m[1].toLowerCase() : null;
}

const AlignAttribute = Extension.create({
  name: "alignAttribute",
  addGlobalAttributes() {
    return [
      {
        types: ["heading", "paragraph", "tableCell", "tableHeader"],
        attributes: {
          dataAlign: {
            default: null,
            parseHTML: (el) => parseAlign(el),
            renderHTML: (a) =>
              a.dataAlign ? { "data-align": a.dataAlign } : {},
          },
        },
      },
    ];
  },
});

// ---------------------------------------------------------------------------
// data-if / data-unless on the built-in paragraph
// ---------------------------------------------------------------------------
const ParagraphConditionAttrs = Extension.create({
  name: "paragraphConditionAttrs",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph"],
        attributes: {
          dataIf: {
            default: null,
            parseHTML: (el) => el.getAttribute("data-if"),
            renderHTML: (a) => (a.dataIf ? { "data-if": a.dataIf } : {}),
          },
          dataUnless: {
            default: null,
            parseHTML: (el) => el.getAttribute("data-unless"),
            renderHTML: (a) =>
              a.dataUnless ? { "data-unless": a.dataUnless } : {},
          },
        },
      },
    ];
  },
});

// ---------------------------------------------------------------------------
// <div> — generic (style/class), plus data-repeat / data-if variants
// ---------------------------------------------------------------------------
const Div = Node.create({
  name: "div",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      dataAlign: {
        default: null,
        parseHTML: (el) => parseAlign(el),
        renderHTML: (a) => (a.dataAlign ? { "data-align": a.dataAlign } : {}),
      },
      class: {
        default: null,
        parseHTML: (el) => el.getAttribute("class"),
        renderHTML: (a) => (a.class ? { class: a.class } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div", priority: 40 }];
  },
  renderHTML({ node }) {
    const attrs: Record<string, string> = {};
    if (node.attrs.dataAlign) attrs["data-align"] = String(node.attrs.dataAlign);
    if (node.attrs.class) attrs.class = String(node.attrs.class);
    return ["div", attrs, 0];
  },
});

// <img> — keep `class` (e.g. the letterhead `doc-logo`) and `width` through a
// round-trip; base64 allowed so a merged/previewed data-URI logo also survives.
const DocImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      class: {
        default: null,
        parseHTML: (el) => el.getAttribute("class"),
        renderHTML: (a) => (a.class ? { class: a.class } : {}),
      },
      width: {
        default: null,
        parseHTML: (el) => el.getAttribute("width"),
        renderHTML: (a) => (a.width ? { width: a.width } : {}),
      },
    };
  },
}).configure({ inline: false, allowBase64: true });

const RepeatBlock = Node.create({
  name: "repeatBlock",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return { collection: { default: "" } };
  },
  parseHTML() {
    return [
      {
        tag: "div[data-repeat]",
        priority: 60,
        getAttrs: (el) => ({
          collection: (el as HTMLElement).getAttribute("data-repeat") ?? "",
        }),
      },
    ];
  },
  renderHTML({ node }) {
    return ["div", { "data-repeat": String(node.attrs.collection ?? "") }, 0];
  },
});

const ConditionalBlock = Node.create({
  name: "conditionalBlock",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return { flag: { default: "" }, negate: { default: false } };
  },
  parseHTML() {
    return [
      {
        tag: "div[data-if]",
        priority: 60,
        getAttrs: (el) => ({
          flag: (el as HTMLElement).getAttribute("data-if") ?? "",
          negate: false,
        }),
      },
      {
        tag: "div[data-unless]",
        priority: 60,
        getAttrs: (el) => ({
          flag: (el as HTMLElement).getAttribute("data-unless") ?? "",
          negate: true,
        }),
      },
    ];
  },
  renderHTML({ node }) {
    const key = node.attrs.negate ? "data-unless" : "data-if";
    return ["div", { [key]: String(node.attrs.flag ?? "") }, 0];
  },
});

const Conditional = Mark.create({
  name: "conditional",
  inclusive: false,
  addAttributes() {
    return { flag: { default: "" }, negate: { default: false } };
  },
  parseHTML() {
    return [
      {
        tag: "span[data-if]",
        getAttrs: (el) => ({
          flag: (el as HTMLElement).getAttribute("data-if") ?? "",
          negate: false,
        }),
      },
      {
        tag: "span[data-unless]",
        getAttrs: (el) => ({
          flag: (el as HTMLElement).getAttribute("data-unless") ?? "",
          negate: true,
        }),
      },
    ];
  },
  renderHTML({ mark }) {
    const key = mark.attrs.negate ? "data-unless" : "data-if";
    return ["span", { [key]: String(mark.attrs.flag ?? "") }, 0];
  },
});

// ---------------------------------------------------------------------------
// tables
// ---------------------------------------------------------------------------
const RepeatTableRow = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      dataRepeat: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-repeat"),
        renderHTML: (a) =>
          a.dataRepeat ? { "data-repeat": a.dataRepeat } : {},
      },
    };
  },
});

/** Cells: inline content, and no `colspan="1"` / `rowspan="1"` noise. */
function inlineCell<T extends typeof TableCell | typeof TableHeader>(base: T) {
  return base.extend({
    content: "inline*",
    renderHTML({ HTMLAttributes }) {
      const attrs: Record<string, unknown> = { ...HTMLAttributes };
      if (attrs.colspan === 1 || attrs.colspan === "1") delete attrs.colspan;
      if (attrs.rowspan === 1 || attrs.rowspan === "1") delete attrs.rowspan;
      if (attrs.colwidth == null) delete attrs.colwidth;
      return [
        base.name === "tableHeader" ? "th" : "td",
        mergeAttributes(attrs),
        0,
      ];
    },
  });
}

const InlineTableCell = inlineCell(TableCell);
const InlineTableHeader = inlineCell(TableHeader);

// ---------------------------------------------------------------------------
export function templateExtensions() {
  return [
    // StarterKit's bold/italic/strike serialise to <strong>/<em>/<s>; the
    // round-trip test treats those as equivalent to the templates' <b>/<i>.
    StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] } }),
    ParagraphConditionAttrs,
    AlignAttribute,
    Underline,
    Link.configure({ openOnClick: false, autolink: false }),
    Table.configure({ resizable: false }),
    RepeatTableRow,
    InlineTableHeader,
    InlineTableCell,
    DocImage,
    Div,
    RepeatBlock,
    ConditionalBlock,
    Conditional,
  ];
}
