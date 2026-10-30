import 'server-only';
import { cache } from 'react';
import { connection } from 'next/server';
import { loadPublishedWebsite } from './public-reader';
export { websiteMetadata } from './metadata';

export const getPublishedWebsite = cache(async () => {
  await connection();
  return loadPublishedWebsite({
    enabled: process.env.WEBSITE_CMS_ENABLED === 'true',
    onFallback: reason => console.warn(`Website CMS baseline fallback: ${reason}`),
    source: async signal => {
      const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!base || !key) return null;
      const response = await fetch(`${base}/rest/v1/website_publications?site_key=eq.main&select=revision_id,public_content`, {
        headers: { apikey: key }, signal, cache: 'no-store', next: { revalidate: 0 },
      });
      if (!response.ok) throw new Error('Website publication unavailable');
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.length !== 1) return null;
      return { revisionId: rows[0].revision_id, publication: rows[0].public_content };
    },
  });
});

