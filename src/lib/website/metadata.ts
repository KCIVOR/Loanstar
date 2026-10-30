import type { Metadata } from 'next';
import type { WebsiteSnapshot } from './public-reader';

export function websiteMetadata(snapshot: WebsiteSnapshot, page: 'landing' | 'login' | 'register', base = process.env.NEXT_PUBLIC_SUPABASE_URL): Metadata {
  const seo = snapshot.content[page].seo;
  const icon = snapshot.assets.find(asset => asset.id === snapshot.content.site.iconAssetId);
  const iconUrl = icon && base ? `${base}/storage/v1/object/public/website-public/${icon.publicPath}` : undefined;
  return {
    title: seo.title, description: seo.description,
    // Explicit empty arrays suppress inherited portal icons for text-only public branding.
    icons: iconUrl ? { icon: iconUrl, apple: iconUrl } : { icon: [], apple: [], shortcut: [] },
  };
}
