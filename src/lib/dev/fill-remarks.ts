/**
 * Dev-only: fill visible remarks / notes / reason fields so demo flows
 * don't require hand-typing. Uses the native value setter so React
 * controlled inputs pick up the change.
 */
import { fakeRemark, inferRemarkKind } from "@/lib/dev/fake-data";

const SKIP_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "date",
  "datetime-local",
  "email",
  "file",
  "hidden",
  "image",
  "month",
  "number",
  "password",
  "radio",
  "range",
  "reset",
  "search",
  "submit",
  "tel",
  "time",
  "url",
  "week",
]);

const HINT =
  /(remarks?|notes?|reasons?|comments?|what needs|what's wrong|basis for)/i;

function setNativeValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function labelTextFor(el: HTMLElement): string {
  if (el.id) {
    const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (label?.textContent) return label.textContent;
  }
  const wrapping = el.closest("label");
  return wrapping?.textContent ?? "";
}

function haystackFor(el: HTMLInputElement | HTMLTextAreaElement): string {
  return [
    el.id,
    el.name,
    el.placeholder,
    el.getAttribute("aria-label"),
    labelTextFor(el),
  ]
    .filter(Boolean)
    .join(" ");
}

function isFillable(
  el: HTMLInputElement | HTMLTextAreaElement,
): el is HTMLInputElement | HTMLTextAreaElement {
  if (el.disabled || el.readOnly) return false;
  if (el.closest("[data-autofill-overlay]")) return false;
  if (el instanceof HTMLInputElement) {
    const type = (el.type || "text").toLowerCase();
    if (SKIP_TYPES.has(type)) return false;
  }
  return HINT.test(haystackFor(el));
}

/** Fill every visible remarks/notes/reason field currently in the DOM. */
export function fillVisibleRemarkFields(): number {
  const nodes = document.querySelectorAll("textarea, input");
  let filled = 0;
  nodes.forEach((node) => {
    if (
      !(node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement)
    ) {
      return;
    }
    if (!isFillable(node)) return;
    setNativeValue(node, fakeRemark(inferRemarkKind(haystackFor(node))));
    filled += 1;
  });
  return filled;
}
