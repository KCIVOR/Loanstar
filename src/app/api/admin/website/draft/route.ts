import { saveDraft, draftRequestSchema } from '@/lib/website/admin-service';
import { readWebsiteJson } from '@/lib/website/errors';
import { websiteEndpoint } from '@/lib/website/http-runtime';
export async function PUT(request: Request) {
  return websiteEndpoint(request, 'edit', async () => ({ draft: await saveDraft(draftRequestSchema.parse(await readWebsiteJson(request))) }));
}
