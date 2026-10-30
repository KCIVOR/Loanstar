import { reconcileDraft, reconcileRequestSchema } from '@/lib/website/admin-service';
import { readWebsiteJson } from '@/lib/website/errors';
import { websiteEndpoint } from '@/lib/website/http-runtime';
export async function POST(request: Request) {
  return websiteEndpoint(request, 'edit', async () => ({ draft: await reconcileDraft(reconcileRequestSchema.parse(await readWebsiteJson(request))) }));
}
