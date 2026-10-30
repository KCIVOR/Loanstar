import { publishWebsite, publishRequestSchema } from '@/lib/website/admin-service';
import { readWebsiteJson } from '@/lib/website/errors';
import { websiteEndpoint } from '@/lib/website/http-runtime';
export async function POST(request: Request) {
  return websiteEndpoint(request, 'edit', async () => ({ revision: await publishWebsite(publishRequestSchema.parse(await readWebsiteJson(request))) }), true);
}
