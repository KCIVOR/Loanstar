import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  assertDecisionTemplateContent,
  isCommitteeDecisionSlug,
} from "@/lib/email/decision-templates";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ slug: string }> };

const patchTemplateSchema = z.object({
  subject: z.string(),
  bodyHtml: z.string(),
});

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

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireModulePermission("system_config", "view");
    const { slug } = await context.params;

    if (!isCommitteeDecisionSlug(slug)) {
      return NextResponse.json(
        { error: "Email template not found" },
        { status: 404 },
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("email_templates")
      .select("slug, name, subject, body_html, updated_at")
      .eq("slug", slug)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json(
        { error: "Email template not found" },
        { status: 404 },
      );
    }

    return jsonOk({ template: mapTemplate(data) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireModulePermission("system_config", "edit");
    const { slug } = await context.params;

    if (!isCommitteeDecisionSlug(slug)) {
      return NextResponse.json(
        { error: "Email template not found" },
        { status: 404 },
      );
    }

    const body = patchTemplateSchema.parse(await request.json());

    try {
      assertDecisionTemplateContent({
        slug,
        subject: body.subject,
        bodyHtml: body.bodyHtml,
      });
    } catch (validationError) {
      const message =
        validationError instanceof Error
          ? validationError.message
          : "Invalid template content";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("email_templates")
      .update({
        subject: body.subject.trim(),
        body_html: body.bodyHtml.trim(),
      })
      .eq("slug", slug)
      .select("slug, name, subject, body_html, updated_at")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json(
        { error: "Email template not found" },
        { status: 404 },
      );
    }

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "system_config",
      action: "update",
      entityType: "email_template",
      entityId: slug,
      afterData: { slug: data.slug, subject: data.subject },
    });

    return jsonOk({ template: mapTemplate(data) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
