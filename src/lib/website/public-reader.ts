import { DEFAULT_WEBSITE } from './default-content';
import { publicationSchema, type PublicAsset, type WebsiteContent } from './schema';

export type WebsiteSnapshot = {
  origin: 'published' | 'fallback';
  revisionId: string | null;
  content: WebsiteContent;
  assets: PublicAsset[];
};
type Source = (signal: AbortSignal) => Promise<{ revisionId: string; publication: unknown } | null>;

export async function loadPublishedWebsite({ enabled, source, timeoutMs = 2000, onFallback }: { enabled: boolean; source: Source; timeoutMs?: number; onFallback?: (reason: 'missing' | 'invalid' | 'timeout' | 'unavailable') => void }): Promise<WebsiteSnapshot> {
  const fallback = (): WebsiteSnapshot => ({ origin: 'fallback', revisionId: null, content: DEFAULT_WEBSITE, assets: [] });
  const report = (reason: 'missing' | 'invalid' | 'timeout' | 'unavailable') => { try { onFallback?.(reason); } catch { /* Diagnostics must not block public forms. */ } };
  if (!enabled) return fallback();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('CMS read deadline')); }, timeoutMs);
    });
    const row = await Promise.race([source(controller.signal), deadline]);
    if (!row || !row.revisionId) { report('missing'); return fallback(); }
    const publication = publicationSchema.safeParse(row.publication);
    if (!publication.success) { report('invalid'); return fallback(); }
    return { origin: 'published', revisionId: row.revisionId, ...publication.data };
  } catch {
    report(controller.signal.aborted ? 'timeout' : 'unavailable');
    return fallback();
  } finally { if (timer) clearTimeout(timer); }
}
