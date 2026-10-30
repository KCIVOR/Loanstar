import Link from "next/link";
import type { PublicAsset, WebsiteContent } from "@/lib/website/schema";
import { WebsiteLogo } from "./WebsiteLogo";
import { LandingSection } from "./sections/LandingSection";
export function LandingPageView({
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
  const landing = content.landing,
    preview = mode === "preview",
    href = (value: string) => (preview ? "#" : value);
  return (
    <div className="landing-page bg-canvas">
      <header className="landing-topnav">
        <div className="landing-topnav-in">
          <Link
            href={href("/")}
            className="inline-flex items-center no-underline"
          >
            <WebsiteLogo
              site={content.site}
              assets={assets}
              assetUrls={preview ? assetUrls : undefined}
              height={36}
            />
          </Link>
          <nav aria-label="Primary">
            {landing.navigation.map((n) => (
              <a key={n.id} href={href(n.href)}>
                {n.label}
              </a>
            ))}
          </nav>
          <div className="right">
            <Link href={href("/login")} className="login-link">
              {landing.loginLabel}
            </Link>
            <Link href={href("/register")} className="btn btn-accent">
              {landing.applyLabel}
            </Link>
          </div>
        </div>
      </header>
      {landing.sections.map((section) => (
        <LandingSection
          key={section.id}
          section={section}
          site={content.site}
          assets={assets}
          assetUrls={preview ? assetUrls : undefined}
          preview={preview}
        />
      ))}
      <footer className="landing-foot">
        <div className="landing-foot-in">
          <div className="landing-foot-top">
            <div>
              <Link href={href("/")} className="logo">
                <WebsiteLogo
                  site={content.site}
                  assets={assets}
                  assetUrls={preview ? assetUrls : undefined}
                  height={40}
                />
              </Link>
              <p>{landing.footer.description}</p>
            </div>
            <div className="landing-foot-cols">
              {landing.footer.columns.map((column) => (
                <div key={column.id}>
                  <h5>{column.title}</h5>
                  {column.links.map((link) =>
                    link.href ? (
                      <a key={link.id} href={href(link.href)}>
                        {link.label}
                      </a>
                    ) : (
                      <span
                        key={link.id}
                        className="mb-2 block text-[13.5px] text-navy-200"
                      >
                        {link.label}
                      </span>
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="landing-foot-btm">
            <span>{landing.footer.copyright}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
