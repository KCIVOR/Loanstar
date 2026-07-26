import { BRANDING } from "@/lib/branding";

export type MeridianEmailTone = "neutral" | "success";

export type BuildMeridianEmailHtmlInput = {
  eyebrow: string;
  title: string;
  /** Inner HTML only (paragraphs). May include `{{merge_vars}}`. */
  bodyHtml: string;
  tone?: MeridianEmailTone;
  preheader?: string;
};

const FONT_BODY =
  "'Public Sans', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const FONT_DISPLAY =
  "Sora, 'Public Sans', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * Table-based Meridian transactional email shell (inline styles for clients).
 * Reusable for decision emails, test mail, and future reminders.
 */
export function buildMeridianEmailHtml(
  opts: BuildMeridianEmailHtmlInput,
): string {
  const tone = opts.tone ?? "neutral";
  const preheader = opts.preheader?.trim() ?? "";
  const logoUrl = BRANDING.logoUrl;

  const eyebrowStyles =
    tone === "success"
      ? "display:inline-block;font-family:JetBrains Mono,Consolas,monospace;font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#178A50;background:#E8F6EE;border:1px solid #BCE4CD;border-radius:6px;padding:6px 10px;"
      : "display:inline-block;font-family:JetBrains Mono,Consolas,monospace;font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#23539E;background:#E8F0FB;border:1px solid #C4D6EF;border-radius:6px;padding:6px 10px;";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>LoanStar</title>
</head>
<body style="margin:0;padding:0;background-color:#F7F9FC;-webkit-font-smoothing:antialiased;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>` : ""}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F7F9FC;margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;background-color:#FFFFFF;border:1px solid #D9E0EB;border-radius:14px;overflow:hidden;">
        <tr>
          <td style="background-color:#0C2247;background:linear-gradient(135deg,#071633 0%,#0C2247 55%,#123061 100%);padding:28px 32px;">
            <img src="${logoUrl}" alt="LoanStar" width="116" height="40" style="display:block;border:0;outline:none;width:116px;height:40px;background:transparent;" />
          </td>
        </tr>
        <tr>
          <td style="height:4px;line-height:4px;font-size:0;background-color:#0D9488;">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding:32px 32px 8px 32px;">
            <span style="${eyebrowStyles}">${escapeHtml(opts.eyebrow)}</span>
            <h1 style="margin:16px 0 0 0;font-family:${FONT_DISPLAY};font-size:22px;font-weight:700;letter-spacing:-0.02em;line-height:1.3;color:#0C2247;">
              ${escapeHtml(opts.title)}
            </h1>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 32px 32px;font-family:${FONT_BODY};font-size:15px;line-height:1.6;color:#16233B;">
            ${opts.bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 28px 32px;border-top:1px solid #E7ECF3;font-family:${FONT_BODY};font-size:12px;line-height:1.5;color:#8C99B0;">
            <strong style="color:#3E4C66;font-weight:600;">LoanStar</strong><br />
            This message was sent by LoanStar. If you have questions, please contact our office.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
