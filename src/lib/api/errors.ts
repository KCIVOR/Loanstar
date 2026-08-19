/**
 * Expected business-rule / precondition failures (e.g. "upload X before
 * closing", "select a release path first") — the caller can fix the request
 * and retry, so this maps to a 400, not a 500 (see handleApiError in
 * ./handler). Do NOT use this for unexpected failures (DB errors, missing
 * records that indicate a bug) — those should stay plain `Error` so they
 * surface as 500s and get investigated as bugs.
 *
 * Deliberately dependency-free (no next/headers, no Supabase) — several
 * modules that throw this (e.g. lra/pdc-collect.ts) are imported directly by
 * Client Components for their pure helper functions, and pulling in
 * server-only code here would break the client bundle.
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
