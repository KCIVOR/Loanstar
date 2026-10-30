import { getPublishedWebsite, websiteMetadata } from '@/lib/website/public-runtime';
import { LoginPageView } from '@/components/website/LoginPageView';
export default async function Page() {
  const snapshot = await getPublishedWebsite();
  return <LoginPageView content={snapshot.content} assets={snapshot.assets} />;
}
export async function generateMetadata() { return websiteMetadata(await getPublishedWebsite(), 'login'); }
