import { handleApiError, jsonOk } from "@/lib/api/handler";
import { COMMITTEE_DECISION_SLUGS } from "@/lib/email/decision-templates";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

function mapTemplate(row: {
  slug: string;
  name: string;
  subject: string;
  body_html: string;
  updated_at: string;
}) {
  return {
    slug: row.slug,
    name: row.name,
    subject: row.subject,
    bodyHtml: row.body_html,
    updatedAt: row.updated_at,
  };
}

export async function GET() {
  try {
    await requireModulePermission("system_config", "view");
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("email_templates")
      .select("slug, name, subject, body_html, updated_at")
      .in("slug", [...COMMITTEE_DECISION_SLUGS]);

    if (error) throw new Error(error.message);

    return jsonOk({
      templates: (data ?? []).map(mapTemplate),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
