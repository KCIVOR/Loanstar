import { handleApiError, jsonOk, ValidationError } from "@/lib/api/handler";
import { writeAuditEvent } from "@/lib/audit/writer";
import { requireSuperAdmin } from "@/lib/legacy-import/server";
import { runSchema } from "@/lib/legacy-import/schemas";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    await requireSuperAdmin();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("legacy_import_runs")
      .select("id, file_name, segment, mapping_id, total_rows, valid_rows, warning_rows, error_rows, status, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return jsonOk({ runs: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Audit log: one row per dry-run validation. */
export async function POST(request: Request) {
  try {
    const user = await requireSuperAdmin();
    const parsed = runSchema.safeParse(await request.json());
    if (!parsed.success) throw new ValidationError("Invalid run record");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("legacy_import_runs")
      .insert({ ...parsed.data, status: "validated", created_by: user.id })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "system_config",
      action: "create",
      entityType: "legacy_import_run",
      entityId: data.id,
      afterData: {
        trigger: "legacy_import_run",
        fileName: parsed.data.file_name,
        segment: parsed.data.segment,
        rowCount: parsed.data.total_rows,
        validRows: parsed.data.valid_rows,
        warningRows: parsed.data.warning_rows,
        errorRows: parsed.data.error_rows,
      },
    });
    return jsonOk({ run: data }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
