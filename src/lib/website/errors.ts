import { z } from 'zod';

export class WebsiteError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export function assertSameOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const authority = request.headers.get('host');
  let expectedOrigin = requestUrl.origin;
  if (authority) {
    // Next may reconstruct request.url with its bind address (0.0.0.0).
    // Host is the browser's actual destination; never accept forwarded-host here.
    if (/[\\/@?#,%\s]/.test(authority)) throw new WebsiteError(403, 'Same-origin request required');
    try { expectedOrigin = new URL(`${requestUrl.protocol}//${authority}`).origin; }
    catch { throw new WebsiteError(403, 'Same-origin request required'); }
  }
  if (request.headers.get('origin') !== expectedOrigin) {
    throw new WebsiteError(403, 'Same-origin request required');
  }
}

export async function readWebsiteBytes(request: Request, maximum: number) {
  const declared = Number(request.headers.get('content-length'));
  if (declared > maximum) throw new WebsiteError(413, 'Request is too large');
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new WebsiteError(413, 'Request is too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export async function readWebsiteJson(request: Request): Promise<unknown> {
  const bytes = await readWebsiteBytes(request, 262144);
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new WebsiteError(400, 'Invalid JSON'); }
}

export function websiteResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

export function websiteFailure(error: unknown) {
  if (error instanceof WebsiteError) return websiteResponse({ error: error.message }, error.status);
  if (error instanceof z.ZodError) return websiteResponse({ error: 'Invalid website content', issues: error.issues.map(i => ({ path: i.path, message: i.message })) }, 400);
  if (error instanceof Error && error.name === 'AuthError') return websiteResponse({ error: 'Authentication required' }, 401);
  if (error instanceof Error && error.name === 'ForbiddenError') return websiteResponse({ error: 'Insufficient permissions' }, 403);
  console.error('Website CMS operation failed', error instanceof Error ? error.name : 'unknown');
  return websiteResponse({ error: 'Website service is unavailable. Please try again.' }, 503);
}

export function checkDatabaseError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (error.code === 'PT409' || error.code === '40001' || error.code === '23505') throw new WebsiteError(409, 'Website changed. Reload and compare before retrying.');
  if (error.code === '42501') throw new WebsiteError(403, 'Insufficient website permissions');
  if (error.code === '22023' || error.code === '23514') throw new WebsiteError(400, 'Invalid content or missing website media');
  if (error.code === 'P0002') throw new WebsiteError(404, 'Website record not found');
  throw new WebsiteError(503, 'Website database is unavailable');
}
