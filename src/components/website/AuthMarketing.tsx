import Link from "next/link";
import type {
  AuthPageContent,
  PublicAsset,
  WebsiteContent,
} from "@/lib/website/schema";
import { WebsiteLogo } from "./WebsiteLogo";
import { TextHeading } from "./TextHeading";
export function AuthMarketing({
  content,
  site,
  assets,
  assetUrls,
  preview = false,
}: {
  content: AuthPageContent;
  site: WebsiteContent["site"];
  assets: PublicAsset[];
  assetUrls?: Record<string, string>;
  preview?: boolean;
}) {
  if (!content.marketing.enabled) return null;
  const m = content.marketing,
    t = m.testimonial;
  return (
    <div className="login-brand">
      <Link
        href={preview ? "#" : "/"}
        className="inline-flex items-center no-underline"
      >
        <WebsiteLogo
          site={site}
          assets={assets}
          assetUrls={assetUrls}
          height={36}
        />
      </Link>
      <div className="mid">
        <h2>
          <TextHeading text={m.title} emphasis={m.emphasis} />
        </h2>
        <p>{m.body}</p>
        {t.enabled && (
          <div className="login-quote">
            <div className="q">&ldquo;{t.quote}&rdquo;</div>
            <div className="who">
              <span className="av">{t.initials}</span>
              <div>
                <b>{t.name}</b>
                <span>{t.role}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
