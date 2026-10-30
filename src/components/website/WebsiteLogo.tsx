import type { PublicAsset, WebsiteContent } from "@/lib/website/schema";
export function WebsiteLogo({
  site,
  assets = [],
  height = 40,
  assetUrls = {},
}: {
  site: WebsiteContent["site"];
  assets?: PublicAsset[];
  height?: number;
  assetUrls?: Record<string, string>;
}) {
  const asset = assets.find((a) => a.id === site.logoAssetId);
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const candidate = site.logoAssetId ? assetUrls[site.logoAssetId] : undefined;
  const privateUrl =
    site.logoAssetId &&
    candidate === `/api/admin/website/assets/${site.logoAssetId}/preview`
      ? candidate
      : undefined;
  if ((!asset || !base) && !privateUrl)
    return (
      <span
        role="img"
        aria-label={site.logoAlt}
        style={{ fontSize: height * 0.58, fontWeight: 800, lineHeight: 1.2 }}
      >
        {site.companyName}
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element -- immutable validated CMS storage image
    <img
      src={
        privateUrl ??
        `${base}/storage/v1/object/public/website-public/${asset!.publicPath}`
      }
      alt={site.logoAlt}
      height={height}
      width={Math.round(
        (height * (asset?.width ?? 189)) / (asset?.height ?? 65),
      )}
      style={{ height, width: "auto" }}
    />
  );
}
