import 'server-only';
import { requireWebsiteActor } from './admin-service';
import { assertSameOrigin, websiteFailure, websiteResponse } from './errors';

export async function websiteEndpoint(request: Request, action: 'view' | 'edit', handler: () => Promise<unknown>, publish = false) {
  try {
    await requireWebsiteActor(action, publish);
    if (request.method !== 'GET') assertSameOrigin(request);
    return websiteResponse(await handler());
  } catch (error) { return websiteFailure(error); }
}
