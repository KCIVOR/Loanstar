import { readFileSync } from "node:fs";
import { join } from "node:path";

import { BRANDING } from "@/lib/branding";

import type { GotenbergAsset } from "./gotenberg";

/**
 * Letterhead for the Chromium renderer, matching the LSLGC source documents:
 * the company wordmark appears ONCE, centered, at the very top of page 1 (as a
 * `.doc-letterhead` block prepended to the merged body — see `index.ts`), NOT as
 * a running page header. A discreet "Page X of Y" footer runs on every page
 * (Chattel Mortgage / REM / Loan Agreement originals carry one; PN / Disclosure
 * do not — a footer everywhere is the tidier house choice).
 *
 * Logo source, in order: the bundled hi-res asset
 * `assets/letterhead-logo.png` (extracted from the source docs' `image1.jpeg`,
 * white background, deterministic) → else the public `branding/logo.png`.
 */

const LOGO_PATH = join(
  process.cwd(),
  "src/lib/documents/render/assets/letterhead-logo.png",
);

let cachedLogo: GotenbergAsset | null | undefined;

export async function getLogoAsset(): Promise<GotenbergAsset | null> {
  if (cachedLogo !== undefined) return cachedLogo;

  try {
    const bytes = new Uint8Array(readFileSync(LOGO_PATH));
    cachedLogo = { name: "logo.png", bytes, contentType: "image/png" };
    return cachedLogo;
  } catch {
    // fall through to the network asset
  }

  try {
    const res = await fetch(BRANDING.logoUrl);
    if (!res.ok) {
      cachedLogo = null;
      return null;
    }
    cachedLogo = {
      name: "logo.png",
      bytes: new Uint8Array(await res.arrayBuffer()),
      contentType: res.headers.get("content-type") ?? "image/png",
    };
    return cachedLogo;
  } catch {
    cachedLogo = null;
    return null;
  }
}

/** The centered wordmark block prepended to page 1 (styled by `.doc-letterhead`). */
export function buildBodyLetterhead(hasLogo: boolean): string {
  const inner = hasLogo
    ? `<img src="logo.png" alt="Loan Star Lending Group Corp." />`
    : `<strong>LOAN STAR LENDING GROUP CORP.</strong>`;
  return `<div class="doc-letterhead">${inner}</div>`;
}

const FOOTER_STYLE =
  "font-family:'Times New Roman','Liberation Serif',Georgia,serif;" +
  "font-size:8pt;color:#666;width:100%;box-sizing:border-box;" +
  "padding:0 1in;text-align:center;";

export function buildFooterHtml(): string {
  return (
    `<div style="${FOOTER_STYLE}">` +
    `Page <span class="pageNumber"></span> of <span class="totalPages"></span>` +
    `</div>`
  );
}
