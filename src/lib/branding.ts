const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://acopcwlhkovssjnrqygk.supabase.co";

/** Bump when re-uploading branding assets so browsers skip stale cache. */
const BRANDING_VERSION = "3";

/** Public branding assets in the `branding` storage bucket. */
export const BRANDING = {
  logoUrl: `${SUPABASE_URL}/storage/v1/object/public/branding/logo.png?v=${BRANDING_VERSION}`,
  iconUrl: `${SUPABASE_URL}/storage/v1/object/public/branding/favicon.png?v=${BRANDING_VERSION}`,
} as const;
