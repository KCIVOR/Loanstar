import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { STAGES } from "@/lib/constants";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

const createChecklistSchema = z.object({
  stage: z.enum(STAGES),
  documentTypeId: z.string().uuid(),
  isRequired: z.boolean().optional().default(true),
  isOptionalFlag: z.boolean().optional().default(false),
  sortOrder: z.number().int().min(0).optional().default(0),
});

export async function GET(request: Request) {
  try {
    await requireModulePermission("system_config", "view");
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const stage = searchParams.get("stage");

    let query = supabase
      .from("stage_checklists")
      .select(
        `
        id,
        stage,
        is_required,
        is_optional_flag,
        sort_order,
        created_at,
        document_types ( id, slug, name )
      `,
      )
      .order("stage")
      .order("sort_order");

    if (stage) {
      query = query.eq("stage", stage);
    }

    const { data, error } = await query;

    if (error) throw new Error(error.message);

    const items = (data ?? []).map((row) => {
      const docType = Array.isArray(row.document_types)
        ? row.document_types[0]
        : row.document_types;

      return {
        id: row.id,
        stage: row.stage,
        isRequired: row.is_required,
        isOptionalFlag: row.is_optional_flag,
        sortOrder: row.sort_order,
        createdAt: row.created_at,
        documentType: docType
          ? { id: docType.id, slug: docType.slug, name: docType.name }
          : null,
      };
    });

    return jsonOk({ items });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireModulePermission("system_config", "create");
    const body = createChecklistSchema.parse(await request.json());
    const supabase = await createClient();

    const { data: item, error } = await supabase
      .from("stage_checklists")
      .insert({
        stage: body.stage,
        document_type_id: body.documentTypeId,
        is_required: body.isRequired,
        is_optional_flag: body.isOptionalFlag,
        sort_order: body.sortOrder,
      })
      .select(
        `
        id,
        stage,
        is_required,
        is_optional_flag,
        sort_order,
        created_at,
        document_types ( id, slug, name )
      `,
      )
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Checklist item already exists for this stage and document type" },
          { status: 409 },
        );
      }
      throw new Error(error.message);
    }

    const docType = Array.isArray(item.document_types)
      ? item.document_types[0]
      : item.document_types;

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "system_config",
      action: "create",
      entityType: "stage_checklist",
      entityId: item.id,
      afterData: {
        stage: body.stage,
        documentTypeId: body.documentTypeId,
        isRequired: body.isRequired,
        isOptionalFlag: body.isOptionalFlag,
        sortOrder: body.sortOrder,
      },
    });

    return jsonOk(
      {
        item: {
          id: item.id,
          stage: item.stage,
          isRequired: item.is_required,
          isOptionalFlag: item.is_optional_flag,
          sortOrder: item.sort_order,
          createdAt: item.created_at,
          documentType: docType
            ? { id: docType.id, slug: docType.slug, name: docType.name }
            : null,
        },
      },
      201,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
