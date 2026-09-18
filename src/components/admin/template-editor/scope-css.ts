/**
 * Scope an unscoped stylesheet (PRINT_CSS) to only apply inside one container
 * class, for the editor's live preview. PRINT_CSS is correct as-is for its
 * other use — wrapping a standalone document handed to the PDF renderer,
 * where a bare `body { font-family: … }` is exactly right — but injected
 * directly into the admin page it hijacks the whole page's typography (the
 * `<style>` tag has no scoping of its own). This rewrites every selector to
 * live under `scopeClass` instead, client-side only, using the browser's own
 * CSS parser (via a throwaway `<style>` element) rather than a hand-rolled
 * selector-list regex — safe against the attribute/pseudo selectors PRINT_CSS
 * already uses (`table[data-plain] th`, `[data-if]`, etc).
 */
export function scopeCssToClass(css: string, scopeClass: string): string {
  if (typeof document === "undefined") return "";

  const styleEl = document.createElement("style");
  styleEl.textContent = css;
  // Must be attached for `.sheet` to be populated in every browser.
  document.head.appendChild(styleEl);
  const sheet = styleEl.sheet;

  const out = sheet ? Array.from(sheet.cssRules).map((r) => scopeRule(r, scopeClass)) : [];
  document.head.removeChild(styleEl);
  return out.join("\n");
}

function scopeRule(rule: CSSRule, scopeClass: string): string {
  // @font-face / @page don't select page content — leave untouched.
  if (rule instanceof CSSFontFaceRule || rule instanceof CSSPageRule) {
    return rule.cssText;
  }
  if (rule instanceof CSSMediaRule) {
    const inner = Array.from(rule.cssRules)
      .map((r) => scopeRule(r, scopeClass))
      .join("\n");
    return `@media ${rule.media.mediaText} {\n${inner}\n}`;
  }
  if (rule instanceof CSSStyleRule) {
    const selector = scopeSelectorList(rule.selectorText, scopeClass);
    return `${selector} { ${rule.style.cssText} }`;
  }
  return rule.cssText;
}

function scopeSelectorList(selectorText: string, scopeClass: string): string {
  return selectorText
    .split(",")
    .map((s) => s.trim())
    .map((s) => {
      // `body`/`html`/`:root` targeted the whole page — redirect to the
      // scope element itself rather than (meaninglessly) a descendant of it.
      if (s === "body" || s === "html" || s === ":root") return `.${scopeClass}`;
      return `.${scopeClass} ${s}`;
    })
    .join(", ");
}
