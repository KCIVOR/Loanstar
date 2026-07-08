import { Resend } from "resend";

import { createServiceClient } from "@/lib/supabase/server";

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

const DEFAULT_FROM = "LoanStar <noreply@loanstar.local>";

function renderTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return variables[key] ?? "";
  });
}

/**
 * Sends a transactional email using a row from `email_templates` and Resend.
 */
export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const supabase = createServiceClient();
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

  const resend = new Resend(apiKey);
  const { data, error: sendError } = await resend.emails.send({
    from: input.from ?? DEFAULT_FROM,
    to: recipients,
    subject,
    html,
  });

  if (sendError || !data?.id) {
    throw new Error(
      `Failed to send email: ${sendError?.message ?? "unknown error"}`,
    );
  }

  return {
    id: data.id,
    to: recipients,
    subject,
  };
}
