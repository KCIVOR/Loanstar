import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BRANDING } from "../../branding";
import { buildMeridianEmailHtml } from "../meridian-layout";

describe("buildMeridianEmailHtml", () => {
  it("renders Meridian shell with logo-only header, accent, and body", () => {
    const html = buildMeridianEmailHtml({
      eyebrow: "Application update",
      title: "We have an update on your application",
      bodyHtml: "<p>Dear {{borrower_name}},</p><p>Sample body.</p>",
      tone: "neutral",
      preheader: "LoanStar application update",
    });

    assert.match(html, /#0C2247|#071633/);
    assert.match(html, /#0D9488/);
    assert.match(html, /#F7F9FC/);
    assert.ok(html.includes(BRANDING.logoUrl));
    assert.match(html, /alt="LoanStar"/);
    assert.match(html, /background:transparent/);
    assert.doesNotMatch(html, /border-radius:8px;background:#FFFFFF/);
    assert.doesNotMatch(
      html,
      /font-size:20px;font-weight:700;letter-spacing:-0\.02em;color:#FFFFFF;">\s*LoanStar\s*</,
    );
    assert.match(html, /Application update/);
    assert.match(html, /We have an update on your application/);
    assert.match(html, /Dear \{\{borrower_name\}\}/);
    assert.match(html, /Sample body/);
    assert.match(html, /LoanStar application update/);
  });

  it("uses success eyebrow styling for approve tone", () => {
    const html = buildMeridianEmailHtml({
      eyebrow: "Application approved",
      title: "Your application was approved",
      bodyHtml: "<p>Thanks.</p>",
      tone: "success",
    });

    assert.match(html, /#178A50|#E8F6EE/);
    assert.match(html, /Application approved/);
  });
});
