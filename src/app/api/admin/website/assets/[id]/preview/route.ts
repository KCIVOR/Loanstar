import { z } from 'zod';
import { requireWebsiteActor, websiteServiceClient } from '@/lib/website/admin-service';
import { getWebsiteAssetBytes } from '@/lib/website/assets';
import { websiteFailure } from '@/lib/website/errors';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireWebsiteActor();
    const id = z.string().uuid().parse((await context.params).id);
    const { blob, mimeType } = await getWebsiteAssetBytes(websiteServiceClient(), id);
    return new Response(blob, { headers: { 'Content-Type': mimeType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) { return websiteFailure(error); }
}
