import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { WebsiteError } from './errors';

export const WEBSITE_IMAGE_LIMIT = 5 * 1024 * 1024;
export async function normalizeWebsiteImage(input: Uint8Array) {
  if (!input.length || input.length > WEBSITE_IMAGE_LIMIT) throw new WebsiteError(413, 'Image must be 5 MiB or smaller');
  try {
    const decoder = sharp(input, { limitInputPixels: 16000000, failOn: 'warning', animated: true });
    const meta = await decoder.metadata();
    if (!['png', 'jpeg', 'webp'].includes(meta.format ?? '') || (meta.pages ?? 1) !== 1) throw new WebsiteError(415, 'Use a static PNG, JPEG or WebP image');
    if (!meta.width || !meta.height || meta.width * meta.height > 16000000) throw new WebsiteError(413, 'Image exceeds 16 megapixels');
    const { data, info } = await decoder.rotate().png().toBuffer({ resolveWithObject: true });
    if (data.length > WEBSITE_IMAGE_LIMIT) throw new WebsiteError(413, 'Normalized image must be 5 MiB or smaller');
    return { bytes: data, width: info.width, height: info.height, checksum: createHash('sha256').update(data).digest('hex'), mimeType: 'image/png' as const, extension: 'png' as const };
  } catch (error) {
    if (error instanceof WebsiteError) throw error;
    throw new WebsiteError(415, 'Image cannot be decoded safely');
  }
}
