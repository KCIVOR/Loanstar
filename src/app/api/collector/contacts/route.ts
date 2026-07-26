import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

const logSchema = z.object({
  masterlistId: z.string().uuid(),
  contactType: z.enum(["call", "sms", "email", "visit"]),
  notes: z.string().max(2000).optional(),
  callbackAt: z.string().datetime().optional(),
});

export async function GET(request: Request) {
  try {
    await requireModulePermission("collection", "view");
    const supabase = await createClient();
    const masterlistId = new URL(request.url).searchParams.get("masterlistId");

    if (!masterlistId) {
      return NextResponse.json(
        { error: "masterlistId is required" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("collector_contacts")
      .select("id, contact_type, notes, callback_at, created_at, collector_user_id")
      .eq("masterlist_id", masterlistId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return jsonOk({ contacts: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireModulePermission("collection", "edit");
    const body = logSchema.parse(await request.json());
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("collector_contacts")
      .insert({
        masterlist_id: body.masterlistId,
        collector_user_id: user.id,
        contact_type: body.contactType,
        notes: body.notes ?? null,
        callback_at: body.callbackAt ?? null,
      })
      .select("id, contact_type, notes, callback_at, created_at")
      .single();

    if (error) throw new Error(error.message);

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "collection",
      action: "create",
      entityType: "collector_contact",
      entityId: data.id,
      afterData: {
        masterlistId: body.masterlistId,
        contactType: body.contactType,
        hasCallback: Boolean(body.callbackAt),
      },
    });

    return jsonOk({ contact: data }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
