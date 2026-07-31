import fs from "node:fs";
import {
  buildApplicationApprovedEmailHtml,
  buildApplicationDeniedEmailHtml,
  buildTestEmailHtml,
} from "../src/lib/email/meridian-default-bodies";

function updateSql(slug: string, html: string): string {
  // Dollar-quote avoids escaping single quotes inside HTML.
  return `UPDATE public.email_templates
SET body_html = $meridian$${html}$meridian$, updated_at = now()
WHERE slug = '${slug}';`;
}

const sql = [
  "-- Meridian email shell: logo-only header (no wordmark / white logo tile)",
  updateSql("application_denied", buildApplicationDeniedEmailHtml()),
  updateSql("application_approved", buildApplicationApprovedEmailHtml()),
  updateSql("test", buildTestEmailHtml()),
].join("\n\n");

const migrationName = "20260724160000_meridian_email_logo_only_header.sql";

fs.writeFileSync(`supabase/migrations/${migrationName}`, `${sql}\n`, "utf8");
fs.writeFileSync("scripts/_tmp-meridian-apply.sql", `${sql}\n`, "utf8");
console.log("wrote", migrationName, "chars", sql.length);
console.log(
  "header check denied:",
  buildApplicationDeniedEmailHtml().includes("background:#FFFFFF")
    ? "STILL HAS WHITE BG"
    : "ok transparent",
  /color:#FFFFFF;">\s*LoanStar/.test(buildApplicationDeniedEmailHtml())
    ? "STILL HAS WORDMARK"
    : "ok no wordmark",
);
