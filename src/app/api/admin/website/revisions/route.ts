import { listWebsiteRevisions } from '@/lib/website/admin-service';
import { websiteEndpoint } from '@/lib/website/http-runtime';
import { WebsiteError } from '@/lib/website/errors';
export async function GET(request: Request) {
  return websiteEndpoint(request, 'view', async () => {
    const offset = Number(new URL(request.url).searchParams.get('offset') ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) throw new WebsiteError(400, 'Invalid history offset');
    return { revisions: await listWebsiteRevisions(offset) };
  });
}
