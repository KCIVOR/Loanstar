import 'server-only';
import { randomUUID, createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeWebsiteImage } from './assets-core';
import { checkDatabaseError, WebsiteError } from './errors';
import { collectAssetIds, type WebsiteContent, type PublicAsset } from './schema';

const FIELDS = 'id,private_path,public_path,mime_type,byte_size,width,height,checksum,state,created_at';
export type WebsiteAssetRow = { id: string; private_path: string; public_path: string | null; mime_type: string; byte_size: number; width: number; height: number; checksum: string; state: string; created_at: string };
export function assetDto(row: WebsiteAssetRow) {
  return { id: row.id, mime_type: row.mime_type, byte_size: row.byte_size, width: row.width, height: row.height, state: row.state, created_at: row.created_at, previewUrl: `/api/admin/website/assets/${row.id}/preview` };
}
export async function listWebsiteAssets(service: SupabaseClient) {
  const { data, error } = await service.from('website_assets').select(FIELDS).order('created_at', { ascending: false }).limit(100);
  checkDatabaseError(error);
  return (data ?? []) as WebsiteAssetRow[];
}

export async function uploadWebsiteAsset(service: SupabaseClient, actorId: string, bytes: Uint8Array) {
  const image = await normalizeWebsiteImage(bytes);
  const id = randomUUID();
  const path = `${id}/${image.checksum}.${image.extension}`;
  const { error: uploadError } = await service.storage.from('website-drafts').upload(path, image.bytes, { contentType: image.mimeType, upsert: false });
  if (uploadError) throw new WebsiteError(503, 'Image upload failed');
  const { data, error } = await service.rpc('website_register_asset', { p_actor: actorId, p_id: id, p_path: path, p_mime: image.mimeType, p_size: image.bytes.length, p_width: image.width, p_height: image.height, p_checksum: image.checksum });
  // On registry failure leave an unreferenced private object, never a public one.
  checkDatabaseError(error);
  return assetDto(data as WebsiteAssetRow);
}

export async function getWebsiteAssetBytes(service: SupabaseClient, id: string) {
  const { data: row, error } = await service.from('website_assets').select(FIELDS).eq('id', id).single();
  checkDatabaseError(error);
  if (!row) throw new WebsiteError(404, 'Image not found');
  const { data, error: storageError } = await service.storage.from('website-drafts').download(row.private_path);
  if (storageError || !data) throw new WebsiteError(404, 'Image is unavailable');
  return { blob: data, mimeType: row.mime_type as string };
}

export async function prepareWebsiteAssets(service: SupabaseClient, content: WebsiteContent) {
  const ids = collectAssetIds(content);
  if (!ids.length) return;
  const { data, error } = await service.from('website_assets').select(FIELDS).in('id', ids);
  checkDatabaseError(error);
  if (data?.length !== ids.length) throw new WebsiteError(400, 'A selected image is missing');
  for (const row of data as WebsiteAssetRow[]) {
    if (row.state !== 'prepared') {
      const { data: blob, error: readError } = await service.storage.from('website-drafts').download(row.private_path);
      if (readError || !blob) throw new WebsiteError(400, 'Draft image is unavailable');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (createHash('sha256').update(bytes).digest('hex') !== row.checksum) throw new WebsiteError(400, 'Image integrity check failed');
      const { error: uploadError } = await service.storage.from('website-public').upload(row.private_path, bytes, { contentType: row.mime_type, upsert: false, cacheControl: '31536000' });
      if (uploadError) {
        // A concurrent publisher may have uploaded this exact immutable path.
        const { data: existing, error: readExistingError } = await service.storage.from('website-public').download(row.private_path);
        if (readExistingError || !existing || createHash('sha256').update(new Uint8Array(await existing.arrayBuffer())).digest('hex') !== row.checksum) throw new WebsiteError(503, 'Public image preparation failed');
      }
      const { error: updateError } = await service.from('website_assets').update({ state: 'prepared', public_path: row.private_path }).eq('id', row.id);
      checkDatabaseError(updateError);
    }
    const { data: published, error: publishedError } = await service.storage.from('website-public').download(row.private_path);
    if (publishedError || !published || createHash('sha256').update(new Uint8Array(await published.arrayBuffer())).digest('hex') !== row.checksum) throw new WebsiteError(400, 'Published image is missing or changed');
  }
}

export function previewAssets(rows: WebsiteAssetRow[], content: WebsiteContent): PublicAsset[] {
  const ids = collectAssetIds(content);
  return rows.filter(row => ids.includes(row.id)).map(row => ({ id: row.id, publicPath: row.private_path, mimeType: row.mime_type as PublicAsset['mimeType'], width: row.width, height: row.height }));
}
