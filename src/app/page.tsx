import { redirect } from 'next/navigation';
import { fetchActiveProfile, isActiveProfile } from '@/lib/permissions/active-profile';
import { createClient } from '@/lib/supabase/server';
import { getPublishedWebsite, websiteMetadata } from '@/lib/website/public-runtime';
import { LandingPageView } from '@/components/website/LandingPageView';

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // Deactivated users must not be bounced into the dashboard just because
    // their (still valid) Auth token says they're signed in — go through
    // the same active-profile gate requireAuth() uses, so they fall through
    // to the public landing page instead.
    const profile = await fetchActiveProfile(supabase, user.id);
    if (isActiveProfile(profile)) {
      redirect("/dashboard");
    }
  }

  const snapshot = await getPublishedWebsite();
  return <LandingPageView content={snapshot.content} assets={snapshot.assets} />;
}

export async function generateMetadata() { return websiteMetadata(await getPublishedWebsite(), 'landing'); }
