import fs from "node:fs";
import {
  buildApplicationApprovedEmailHtml,
  buildApplicationDeniedEmailHtml,
  buildTestEmailHtml,
} from "../src/lib/email/meridian-default-bodies";

const triples: Array<[string, string]> = [
  ["application_denied", buildApplicationDeniedEmailHtml()],
  ["application_approved", buildApplicationApprovedEmailHtml()],
  ["test", buildTestEmailHtml()],
];

for (const [slug, html] of triples) {
  const sql = `UPDATE public.email_templates
SET body_html = $meridian$${html}$meridian$, updated_at = now()
WHERE slug = '${slug}';
`;
  fs.writeFileSync(`scripts/_apply_${slug}.sql`, sql, "utf8");
  console.log(slug, html.length);
}
