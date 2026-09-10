import { makeDeterministic } from "./deterministic";
import { PRINT_CSS } from "./print-styles";

/** Bare filename Gotenberg resolves the `@font-face` src against. */
const FONT_FILENAME = "fonts/doc.woff2";

export class RenderEngineError extends Error {
  readonly detail?: string;
  constructor(message: string, detail?: string) {
    super(message);
    this.name = "RenderEngineError";
    this.detail = detail;
  }
}

export type GotenbergAsset = {
  /** Bare filename referenced from the template HTML, e.g. `logo.png`. */
  name: string;
  bytes: Uint8Array;
  contentType: string;
};

/** Overrides the historical `GOTENBERG_*` env vars (see `engine-config.ts`). */
export type GotenbergConnection = { url?: string; user?: string; pass?: string };

export type GotenbergOptions = {
  headerHtml?: string;
  footerHtml?: string;
  /** Images referenced by bare `<img src="…">` in the merged HTML. */
  assets?: GotenbergAsset[];
  /** Document font, attached per-request so determinism is image-independent. */
  fontWoff2?: Uint8Array;
  /** Service URL + basic-auth creds; falls back to env when a field is absent. */
  connection?: GotenbergConnection;
};

function baseUrl(conn?: GotenbergConnection): string {
  const u = (conn?.url ?? process.env.GOTENBERG_URL ?? "").trim();
  if (!u) throw new RenderEngineError("GOTENBERG_URL is not configured");
  return u.replace(/\/+$/, "");
}

function authHeaders(conn?: GotenbergConnection): Record<string, string> {
  const user = conn?.user ?? process.env.GOTENBERG_BASIC_AUTH_USER;
  const pass = conn?.pass ?? process.env.GOTENBERG_BASIC_AUTH_PASS;
  if (!user || !pass) return {};
  return {
    authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`,
  };
}

/** A copied, non-shared ArrayBuffer view — satisfies the `BlobPart` type. */
function blobPart(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(
    u.byteOffset,
    u.byteOffset + u.byteLength,
  ) as ArrayBuffer;
}

function wrapHtml(mergedHtml: string): string {
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<style>${PRINT_CSS}</style></head><body>${mergedHtml}</body></html>`
  );
}

/**
 * HTML → PDF via a Gotenberg (headless Chromium) service.
 *
 * Serverless-safe: one `fetch`, no browser in-process. `mergedHtml` must already
 * be merged (no `{{tokens}}` / `data-repeat` / `data-if`). Output is passed
 * through the shared deterministic normaliser so the content-hash is
 * reproducible.
 */
export async function htmlToPdfViaGotenberg(
  mergedHtml: string,
  opts: GotenbergOptions = {},
): Promise<Uint8Array> {
  const form = new FormData();
  form.append(
    "files",
    new Blob([wrapHtml(mergedHtml)], { type: "text/html" }),
    "index.html",
  );
  if (opts.fontWoff2) {
    form.append(
      "files",
      new Blob([blobPart(opts.fontWoff2)], { type: "font/woff2" }),
      FONT_FILENAME,
    );
  }
  if (opts.headerHtml) {
    form.append(
      "files",
      new Blob([opts.headerHtml], { type: "text/html" }),
      "header.html",
    );
  }
  if (opts.footerHtml) {
    form.append(
      "files",
      new Blob([opts.footerHtml], { type: "text/html" }),
      "footer.html",
    );
  }
  for (const a of opts.assets ?? []) {
    form.append("files", new Blob([blobPart(a.bytes)], { type: a.contentType }), a.name);
  }

  // Page geometry: PRINT_CSS's `@page { size; margin }` is the single source of
  // truth (size + margins). Gotenberg nests header.html / footer.html inside
  // that page margin, so the `@page` top/bottom margin must leave room for them.
  form.append("preferCssPageSize", "true");
  form.append("printBackground", "true");
  form.append("generateDocumentOutline", "false");

  const res = await fetchWithRetry(
    `${baseUrl(opts.connection)}/forms/chromium/convert/html`,
    { method: "POST", headers: authHeaders(opts.connection), body: form },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new RenderEngineError(
      `Gotenberg returned ${res.status}`,
      detail.slice(0, 500),
    );
  }

  const bytes = Buffer.from(await res.arrayBuffer());
  return new Uint8Array(makeDeterministic(bytes));
}

/** Retry 5xx / network errors with capped exponential backoff. */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempts = 3,
): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, init);
      if (res.ok || res.status < 500) return res;
      lastErr = new RenderEngineError(`Gotenberg ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, 200 * 2 ** i));
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new RenderEngineError("Gotenberg unreachable");
}
