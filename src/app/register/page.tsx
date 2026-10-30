import { getPublishedWebsite, websiteMetadata } from '@/lib/website/public-runtime';
import { RegisterPageView } from '@/components/website/RegisterPageView';
export default async function Page() {
  const snapshot = await getPublishedWebsite();
  return <RegisterPageView content={snapshot.content} assets={snapshot.assets} />;
}
export async function generateMetadata() { return websiteMetadata(await getPublishedWebsite(), 'register'); }
