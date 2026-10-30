import type { PublicAsset, WebsiteContent } from "@/lib/website/schema";
import { LoginFormWithSuspense } from "./LoginForm";
import { AuthPreview } from "./AuthPreview";
export function LoginPageView({
  content,
  assets = [],
  mode = "live",
  assetUrls,
}: {
  content: WebsiteContent;
  assets?: PublicAsset[];
  assetUrls?: Record<string, string>;
  mode?: "live" | "preview";
}) {
  return mode === "preview" ? (
    <AuthPreview
      content={content.login}
      site={content.site}
      assets={assets}
      assetUrls={assetUrls}
      register={false}
    />
  ) : (
    <LoginFormWithSuspense
      content={content.login}
      site={content.site}
      assets={assets}
    />
  );
}
