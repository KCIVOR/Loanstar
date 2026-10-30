"use client";

import { useEffect, useState } from "react";
import type { WebsiteContent } from "@/lib/website/schema";
import { websiteRequest, type WebsiteAsset } from "./types";

export function AssetPicker({
  site,
  onChange,
  disabled,
}: {
  site: WebsiteContent["site"];
  onChange: (site: WebsiteContent["site"]) => void;
  disabled: boolean;
}) {
  const [assets, setAssets] = useState<WebsiteAsset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    websiteRequest<{ assets: WebsiteAsset[] }>("/assets")
      .then((data) => setAssets(data.assets))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div>
      <h3 className="mb-3 font-semibold">Logo and favicon</h3>
      <p className="mb-4 text-sm text-slate-600">
        PNG, JPEG or WebP; at most 5 MiB and 16 megapixels. Uploads stay private
        for drafting. Publishing prepares immutable public copies that may be
        accessible before the release transaction finishes. Referenced images
        are retained for rollback.
      </p>
      {error && (
        <p role="alert" className="mb-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <label className="mb-4 block text-sm">
        Upload approved image
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={disabled || uploading}
          className="mt-2 block"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setUploading(true);
            setError(null);
            try {
              const form = new FormData();
              form.set("file", file);
              const data = await websiteRequest<{ asset: WebsiteAsset }>(
                "/assets",
                { method: "POST", body: form },
              );
              setAssets((previous) => [data.asset, ...previous]);
            } catch (error) {
              setError(
                error instanceof Error ? error.message : "Upload failed",
              );
            } finally {
              setUploading(false);
              e.target.value = "";
            }
          }}
        />
      </label>
      {(
        [
          ["logoAssetId", "Public logo"],
          ["iconAssetId", "Favicon"],
        ] as const
      ).map(([key, label]) => (
        <label className="mb-4 block text-sm" key={key}>
          <span className="mb-1 block font-medium">{label}</span>
          <select
            disabled={disabled}
            value={site[key] ?? ""}
            onChange={(e) =>
              onChange({ ...site, [key]: e.target.value || null })
            }
            className="w-full rounded border p-2"
          >
            <option value="">Text branding / no image</option>
            {site[key] && !assets.some((asset) => asset.id === site[key]) && (
              <option value={site[key]}>Previously selected asset</option>
            )}
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.id.slice(0, 8)} · {asset.width}×{asset.height} ·{" "}
                {asset.mime_type}
              </option>
            ))}
          </select>
          {site[key] && (
            // eslint-disable-next-line @next/next/no-img-element -- authenticated private media stream
            <img
              className="mt-2 max-h-20 max-w-64 object-contain"
              src={`/api/admin/website/assets/${site[key]}/preview`}
              alt={`${label} draft preview`}
            />
          )}
        </label>
      ))}
    </div>
  );
}
