import { handleApiError, jsonOk, ValidationError } from "@/lib/api/handler";
import { writeAuditEvent } from "@/lib/audit/writer";
import { requireSuperAdmin } from "@/lib/legacy-import/server";
import { presetSchema } from "@/lib/legacy-import/schemas";
import { createClient } from "@/lib/supabase/server";

const COLUMNS = "id, name, segment, header_row, mapping, created_by, created_at, updated_at";

export async function GET() {
  try {
    await requireSuperAdmin();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("legacy_import_mappings")
      .select(COLUMNS)
      .order("name");
    if (error) throw new Error(error.message);
    return jsonOk({ mappings: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Create, or overwrite by name when `overwrite: true`. */
export async function POST(request: Request) {
  try {
    const user = await requireSuperAdmin();
    const body = (await request.json()) as Record<string, unknown>;
    const parsed = presetSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid mapping preset");
    const supabase = await createClient();

    const { data: existing, error: findError } = await supabase
      .from("legacy_import_mappings")
      .select(COLUMNS)
      .eq("name", parsed.data.name)
      .maybeSingle();
    if (findError) throw new Error(findError.message);

    if (existing && body.overwrite !== true) {
      throw new ValidationError(`A mapping named "${parsed.data.name}" already exists`);
    }

    const { data, error } = existing
      ? await supabase
          .from("legacy_import_mappings")
          .update({ ...parsed.data, updated_at: new Date().toISOString() })
          .eq("id", existing.id)
          .select(COLUMNS)
          .single()
      : await supabase
          .from("legacy_import_mappings")
          .insert({ ...parsed.data, created_by: user.id })
          .select(COLUMNS)
          .single();
    if (error) throw new Error(error.message);
    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "system_config",
      action: existing ? "update" : "create",
      entityType: "legacy_import_mapping",
      entityId: data.id,
      beforeData: existing ? (existing as Record<string, unknown>) : null,
      afterData: data as Record<string, unknown>,
    });
    return jsonOk({ mapping: data }, existing ? 200 : 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireSuperAdmin();
    const id = new URL(request.url).searchParams.get("id");
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new ValidationError("Missing mapping id");
    const supabase = await createClient();
    const { data: before } = await supabase
      .from("legacy_import_mappings")
      .select(COLUMNS)
      .eq("id", id)
      .maybeSingle();
    const { error } = await supabase.from("legacy_import_mappings").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "system_config",
      action: "delete",
      entityType: "legacy_import_mapping",
      entityId: id,
      beforeData: (before as Record<string, unknown> | null) ?? null,
    });
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
