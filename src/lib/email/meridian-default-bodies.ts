import { buildMeridianEmailHtml } from "@/lib/email/meridian-layout";

/** Default Meridian-wrapped bodies for seeded / refreshed email_templates. */

export function buildApplicationDeniedEmailHtml(): string {
  return buildMeridianEmailHtml({
    eyebrow: "Application update",
    title: "We have an update on your application",
    preheader: "LoanStar — application update",
    tone: "neutral",
    bodyHtml: `
<p style="margin:0 0 16px 0;">Dear {{borrower_name}},</p>
<p style="margin:0 0 16px 0;">Thank you for your loan application. After review, we are unable to proceed with your application at this time.</p>
<p style="margin:0 0 16px 0;">If you have questions, please contact our office.</p>
<p style="margin:0;">— LoanStar</p>
`.trim(),
  });
}

export function buildApplicationApprovedEmailHtml(): string {
  return buildMeridianEmailHtml({
    eyebrow: "Application approved",
    title: "Your application has been approved",
    preheader: "LoanStar — application approved",
    tone: "success",
    bodyHtml: `
<p style="margin:0 0 16px 0;">Dear {{borrower_name}},</p>
<p style="margin:0 0 16px 0;">Thank you for your loan application. We are pleased to inform you that your application has been approved.</p>
<p style="margin:0 0 16px 0;">Our team will contact you regarding the next steps.</p>
<p style="margin:0 0 16px 0;">If you have questions, please contact our office.</p>
<p style="margin:0;">— LoanStar</p>
`.trim(),
  });
}

export function buildTestEmailHtml(): string {
  return buildMeridianEmailHtml({
    eyebrow: "System test",
    title: "LoanStar test email",
    preheader: "LoanStar test email",
    tone: "neutral",
    bodyHtml: `
<p style="margin:0 0 16px 0;">This is a test email from LoanStar LMS.</p>
<p style="margin:0;">If you received this message, SMTP is configured correctly.</p>
`.trim(),
  });
}
