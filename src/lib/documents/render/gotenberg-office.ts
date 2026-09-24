import {
  authHeaders,
  baseUrl,
  blobPart,
  fetchWithRetry,
  RenderEngineError,
} from "./gotenberg";
import { makeDeterministic } from "./deterministic";

import type { GotenbergConnection } from "./gotenberg";

export type GotenbergOfficeOptions = {
  /** Service URL + basic-auth creds; falls back to env when a field is absent. */
  connection?: GotenbergConnection;
};

/**
 * Office document (.docx) → PDF via Gotenberg's LibreOffice conversion
 * route. Same Gotenberg service the HTML/Chromium path already uses
 * (htmlToPdfViaGotenberg in gotenberg.ts) — a different route on the same
 * deployment, not new infrastructure. Confirmed reachable on this project's
 * Gotenberg instance via a one-off spike before this was written.
 *
 * `filledDocxBytes` must already have its merge-field tags resolved (see
 * mergeDocxTemplate in docx-merge.ts) — this function only converts the
 * format, it does not touch template tags.
 */
export async function officeToPdfViaGotenberg(
  filledDocxBytes: Buffer | Uint8Array,
  opts: GotenbergOfficeOptions = {},
): Promise<Uint8Array> {
  const form = new FormData();
  form.append(
    "files",
    new Blob([blobPart(filledDocxBytes)], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    "document.docx",
  );

  const res = await fetchWithRetry(
    `${baseUrl(opts.connection)}/forms/libreoffice/convert`,
    { method: "POST", headers: authHeaders(opts.connection), body: form },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new RenderEngineError(
      `Gotenberg (LibreOffice route) returned ${res.status}`,
      detail.slice(0, 500),
    );
  }

  const bytes = Buffer.from(await res.arrayBuffer());
  return new Uint8Array(makeDeterministic(bytes));
}
