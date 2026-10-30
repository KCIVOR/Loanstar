import { restoreWebsite, restoreRequestSchema } from '@/lib/website/admin-service';
import { readWebsiteJson } from '@/lib/website/errors';
import { websiteEndpoint } from '@/lib/website/http-runtime';
export async function POST(request: Request) {
  return websiteEndpoint(request, 'edit', async () => ({ revision: await restoreWebsite(restoreRequestSchema.parse(await readWebsiteJson(request))) }), true);
}
