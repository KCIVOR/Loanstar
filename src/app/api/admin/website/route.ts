import { getWebsiteAdminState } from '@/lib/website/admin-service';
import { websiteEndpoint } from '@/lib/website/http-runtime';
export async function GET(request: Request) {
  return websiteEndpoint(request, 'view', getWebsiteAdminState);
}
