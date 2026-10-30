import { WebsiteLogo } from "../WebsiteLogo";
import type {
  PublicAsset,
  WebsiteContent,
  WebsiteSection,
} from "@/lib/website/schema";
import { SECTION_ANCHORS } from "@/lib/website/links";
import { TextHeading } from "../TextHeading";
function Icon({ kind }: { kind: "globe" | "money" | "repeat" | "check" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={kind === "check" ? "2.4" : "2"}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {kind === "globe" ? (
        <>
          <path d="M2 12h20M2 12c0-3 4-9 10-9s10 6 10 9M2 12c0 3 4 9 10 9s10-6 10-9" />
          <path d="M12 3v18" />
        </>
      ) : kind === "money" ? (
        <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      ) : kind === "repeat" ? (
        <>
          <path d="M21 12a9 9 0 1 1-9-9" />
          <path d="M21 3v6h-6" />
        </>
      ) : (
        <path d="M20 6 9 17l-5-5" />
      )}
    </svg>
  );
}
export function LandingSection({
  section,
  site,
  assets = [],
  preview = false,
  assetUrls,
}: {
  section: WebsiteSection;
  site: WebsiteContent["site"];
  assets?: PublicAsset[];
  assetUrls?: Record<string, string>;
  preview?: boolean;
}) {
  if (!section.enabled) return null;
  const heading = (
    <TextHeading text={section.title} emphasis={section.emphasis} />
  );
  const href = (value: string) => (preview ? "#" : value);
  if (section.type === "hero")
    return (
      <section className="landing-hero landing-panel" id="top">
        <div className="landing-hero-grid" aria-hidden />
        <div className="landing-hero-in">
          <div className="landing-brand">
            <WebsiteLogo
              site={site}
              assets={assets}
              assetUrls={preview ? assetUrls : undefined}
              height={56}
            />
          </div>
          <div className="landing-kicker">{section.kicker}</div>
          <h1>{heading}</h1>
          <p className="sub">{section.description}</p>
          <div className="cta">
            {section.buttons.map((b, i) => (
              <a
                key={b.id}
                href={href(b.href)}
                className={`btn ${i === 0 ? "btn-accent" : "btn-ghost-inv"} btn-lg`}
              >
                {b.label}
              </a>
            ))}
          </div>
        </div>
      </section>
    );
  if (section.type === "products")
    return (
      <section
        className="landing-sec landing-panel"
        id={SECTION_ANCHORS[section.id]}
      >
        <div className="landing-wrap">
          <div className="landing-sec-kicker">{section.kicker}</div>
          <h2>{heading}</h2>
          <p className="lede">{section.description}</p>
          <div className="landing-feat-grid">
            {section.items.map((item) => (
              <div className="landing-feat" key={item.id}>
                <span className="ic" aria-hidden>
                  <Icon kind={item.icon} />
                </span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  if (section.type === "process")
    return (
      <section
        className="landing-sec landing-how landing-panel"
        id={SECTION_ANCHORS[section.id]}
      >
        <div className="landing-wrap">
          <div className="landing-sec-kicker">{section.kicker}</div>
          <h2>{heading}</h2>
          {section.description && <p className="lede">{section.description}</p>}
          <div className="landing-how-steps">
            {section.items.map((item, i) => (
              <div className="landing-how-step" key={item.id}>
                <span className="pt">{i + 1}</span>
                <h4>{item.title}</h4>
                <p>{item.body}</p>
                <span className="tag">{item.tag}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  if (section.type === "benefits")
    return (
      <section
        className="landing-band landing-panel"
        id={SECTION_ANCHORS[section.id]}
      >
        <div className="landing-wrap">
          <div>
            <div
              className="landing-sec-kicker"
              style={{ color: "var(--teal-400)" }}
            >
              {section.kicker}
            </div>
            <h2>{heading}</h2>
            <p className="lede">{section.description}</p>
            <ul>
              {section.items.map((item) => (
                <li key={item.id}>
                  <Icon kind="check" />
                  {item.text}
                </li>
              ))}
            </ul>
          </div>
          <div className="landing-band-card">
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              {section.statementTitle} ·{" "}
              <span
                className="mono"
                style={{ fontSize: 12, color: "var(--teal-400)" }}
              >
                {section.statementReference}
              </span>
            </div>
            {section.statement.map((row) => (
              <div className="row" key={row.id}>
                <span>{row.label}</span>
                <b className={row.highlight ? "ok" : undefined}>{row.value}</b>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  return (
    <section className="landing-cta-final landing-panel" id="closing-cta">
      <div className="landing-sec-kicker" style={{ justifyContent: "center" }}>
        {section.kicker}
      </div>
      <h2>{heading}</h2>
      <p className="lede">{section.description}</p>
      <div className="btns">
        {section.buttons.map((b, i) => (
          <a
            key={b.id}
            href={href(b.href)}
            className={`btn ${i === 0 ? "btn-accent" : "btn-outline"} btn-lg`}
          >
            {b.label}
          </a>
        ))}
      </div>
    </section>
  );
}
