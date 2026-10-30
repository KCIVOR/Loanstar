import type { PublicAsset, WebsiteContent } from "@/lib/website/schema";
import { RegisterForm } from "./RegisterForm";
import { AuthPreview } from "./AuthPreview";
export function RegisterPageView({
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
      content={content.register}
      site={content.site}
      assets={assets}
      assetUrls={assetUrls}
      register
    />
  ) : (
    <RegisterForm
      content={content.register}
      site={content.site}
      assets={assets}
    />
  );
}
