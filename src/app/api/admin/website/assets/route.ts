import { requireWebsiteActor, websiteServiceClient } from '@/lib/website/admin-service';
import { assetDto, listWebsiteAssets, uploadWebsiteAsset } from '@/lib/website/assets';
import { WEBSITE_IMAGE_LIMIT } from '@/lib/website/assets-core';
import { readWebsiteBytes, WebsiteError } from '@/lib/website/errors';
import { websiteEndpoint } from '@/lib/website/http-runtime';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  return websiteEndpoint(request, 'view', async () => ({ assets: (await listWebsiteAssets(websiteServiceClient())).map(assetDto) }));
}
export async function POST(request: Request) {
  return websiteEndpoint(request, 'edit', async () => {
    const actor = await requireWebsiteActor('edit');
    const type = request.headers.get('content-type') ?? '';
    if (!type.startsWith('multipart/form-data;')) throw new WebsiteError(415, 'Multipart image upload required');
    const bytes = await readWebsiteBytes(request, WEBSITE_IMAGE_LIMIT + 65536);
    let form: FormData;
    try { form = await new Response(bytes, { headers: { 'content-type': type } }).formData(); }
    catch { throw new WebsiteError(400, 'Invalid multipart upload'); }
    const file = form.get('file');
    if (!(file instanceof File)) throw new WebsiteError(400, 'Image file is required');
    return { asset: await uploadWebsiteAsset(websiteServiceClient(), actor.id, new Uint8Array(await file.arrayBuffer())) };
  });
}
