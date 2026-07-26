import nodemailer from "nodemailer";

import { createServiceClient } from "@/lib/supabase/server";
import { loadSmtpConfig } from "@/lib/email/smtp-config";

export type SendEmailInput = {
  to: string | string[];
  templateSlug: string;
  variables?: Record<string, string>;
  from?: string;
};

export type SendEmailResult = {
  id: string;
  to: string[];
  subject: string;
};

function renderTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return variables[key] ?? "";
  });
}

/**
 * Sends a transactional email using `email_templates` + SMTP from
 * Superadmin `config_settings` (Google SMTP / nodemailer).
 */
export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const supabase = createServiceClient();
  const smtp = await loadSmtpConfig(supabase);

  if (!smtp.enabled) {
    throw new Error("Transactional email is disabled (email_enabled=false)");
  }
  if (smtp.incomplete.length > 0) {
    throw new Error(
      `SMTP credentials incomplete: ${smtp.incomplete.join(", ")}`,
    );
  }

  const { data: template, error } = await supabase
    .from("email_templates")
    .select("subject, body_html")
    .eq("slug", input.templateSlug)
    .single();

  if (error || !template) {
    throw new Error(
      `Email template '${input.templateSlug}' not found: ${error?.message ?? "missing row"}`,
    );
  }

  const variables = input.variables ?? {};
  const subject = renderTemplate(template.subject, variables);
  const html = renderTemplate(template.body_html, variables);
  const recipients = Array.isArray(input.to) ? input.to : [input.to];
  const from = (input.from?.trim() || smtp.from).trim();
  if (!from) {
    throw new Error("SMTP from address is empty");
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: smtp.user,
      pass: smtp.password,
    },
  });

  const info = await transporter.sendMail({
    from,
    to: recipients.join(", "),
    subject,
    html,
  });

  return {
    id: info.messageId || `smtp-${Date.now()}`,
    to: recipients,
    subject,
  };
}
