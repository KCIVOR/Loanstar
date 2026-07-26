export const AVATAR_BUCKET = "avatars";
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2MB

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function isAllowedAvatarMime(mime: string): boolean {
  return Object.prototype.hasOwnProperty.call(MIME_TO_EXT, mime);
}

export function extensionForAvatarMime(mime: string): string {
  const ext = MIME_TO_EXT[mime];
  if (!ext) throw new Error(`Unsupported avatar type: ${mime}`);
  return ext;
}

/** Path: `{userId}/avatar.{ext}` — first folder segment is auth.uid() for RLS. */
export function buildAvatarStoragePath(userId: string, mime: string): string {
  return `${userId}/avatar.${extensionForAvatarMime(mime)}`;
}

/** Extract storage object path from a public avatar URL, if it belongs to this user. */
export function avatarPathFromPublicUrl(
  publicUrl: string,
  userId: string,
): string | null {
  try {
    const url = new URL(publicUrl);
    const marker = `/object/public/${AVATAR_BUCKET}/`;
    const idx = url.pathname.indexOf(marker);
    if (idx === -1) return null;
    const path = decodeURIComponent(url.pathname.slice(idx + marker.length));
    if (!path.startsWith(`${userId}/`)) return null;
    return path;
  } catch {
    return null;
  }
}
