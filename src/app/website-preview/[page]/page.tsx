import { notFound } from "next/navigation";
import { getWebsiteAdminState } from "@/lib/website/admin-service";
import { collectAssetIds } from "@/lib/website/schema";
import { LandingPageView } from "@/components/website/LandingPageView";
import { LoginPageView } from "@/components/website/LoginPageView";
import { RegisterPageView } from "@/components/website/RegisterPageView";

export default async function WebsitePreviewPage({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;
  if (!["landing", "login", "register"].includes(page)) notFound();
  // Independently checks active user and website view permission; query parameters never enable draft access.
  const state = await getWebsiteAdminState();
  const content = state.draft.content;
  const assetUrls = Object.fromEntries(
    collectAssetIds(content).map((id) => [
      id,
      `/api/admin/website/assets/${id}/preview`,
    ]),
  );
  const props = { content, assetUrls, mode: "preview" as const };
  return (
    <>
      <aside className="sticky top-0 z-50 border-b border-amber-300 bg-amber-50 p-3 text-center text-sm text-amber-950">
        <strong>Draft preview — {page}</strong> · Saved version{" "}
        {state.draft.lock_version} · Forms and navigation are inert.
        <a href="/admin/website" className="ml-3 underline">
          Return to Website Content
        </a>
      </aside>
      {page === "landing" ? (
        <LandingPageView {...props} />
      ) : page === "login" ? (
        <LoginPageView {...props} />
      ) : (
        <RegisterPageView {...props} />
      )}
    </>
  );
}
