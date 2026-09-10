import { BRANDING } from "@/lib/branding";

import type { GotenbergAsset } from "./gotenberg";

/**
 * Running letterhead for the Chromium renderer: a header carrying the company
 * logo and a footer with page numbers. Gotenberg renders `header.html` /
 * `footer.html` as separate mini-documents in the page's top/bottom margin, so
 * the space for them is reserved by the margin form-fields in `gotenberg.ts`,
 * not by `PRINT_CSS`'s `@page`.
 *
 * The logo is fetched once from the PUBLIC `branding` bucket and cached at module
 * scope (warm across invocations on a reused serverless instance).
 *
 * TUNING NOTE: the exact header/footer heights + margin reservations need one
 * pass against the live Gotenberg (Phase 3 snapshot) — Chromium's print
 * header/footer sizing is finicky. Values here are a sane first cut.
 */

let cachedLogo: GotenbergAsset | null | undefined;

export async function getLogoAsset(): Promise<GotenbergAsset | null> {
  if (cachedLogo !== undefined) return cachedLogo;
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

const FRAME_STYLE =
  "font-family:'Liberation Sans',Arial,Helvetica,sans-serif;font-size:8pt;color:#555;" +
  "width:100%;box-sizing:border-box;padding:0 18mm;";

export function buildHeaderHtml(hasLogo: boolean): string {
  const logo = hasLogo
    ? `<img src="logo.png" style="height:9mm;vertical-align:middle;" alt="" />`
    : `<span style="font-weight:700;color:#333;">Loan Star Lending Group Corp.</span>`;
  return `<div style="${FRAME_STYLE}">${logo}</div>`;
}

export function buildFooterHtml(): string {
  return (
    `<div style="${FRAME_STYLE}display:flex;justify-content:space-between;">` +
    `<span>Loan Star Lending Group Corp.</span>` +
    `<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>` +
    `</div>`
  );
}
