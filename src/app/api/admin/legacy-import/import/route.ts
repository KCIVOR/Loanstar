import { handleApiError, jsonOk, ValidationError } from "@/lib/api/handler";
import { buildActiveImport, type ImportOutcome } from "@/lib/legacy-import/active-import";
import { activeImportRequestSchema } from "@/lib/legacy-import/schemas";
import { requireSuperAdmin } from "@/lib/legacy-import/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    await requireSuperAdmin();
    // Optional emergency kill switch. Super-admin authorization and SQL RLS
    // remain mandatory regardless of this setting.
    if (process.env.LEGACY_ACTIVE_IMPORT_ENABLED === "false") return jsonOk({ error: "Legacy imports are temporarily disabled." }, 503);
    const parsed = activeImportRequestSchema.safeParse(await request.json());
    if (!parsed.success) throw new ValidationError("Invalid import request. Submit 1 to 25 accounts per batch.");
    const { rows, mapping, segment, installments, file_name } = parsed.data;
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const part = (type: string) => parts.find((p) => p.type === type)?.value;
    const preflight = buildActiveImport(rows, mapping, segment, installments,
      `${part("year")}-${part("month")}-${part("day")}`);
    if (preflight.errors.length) return jsonOk({ error: "Opening balance validation failed", errors: preflight.errors }, 400);
    const supabase = await createClient();
    const outcomes: ImportOutcome[] = [];
    for (const account of preflight.accounts) {
      const { data, error } = await supabase.rpc("import_legacy_active_account", {
        p_account: account, p_file_name: file_name, p_mapping: mapping,
      });
      const result = data as { masterlistId?: string } | null;
      outcomes.push({
        rowNumber: account.rowNumber, loanNo: String(account.values.legacy_loan_no),
        status: error ? "failed" : "imported",
        message: error ? (error.code === "23505" ? "This legacy loan number already exists. No duplicate was created." : "This account was not saved. Check the server log for details.") : "Imported successfully",
        ...(result?.masterlistId ? { masterlistId: result.masterlistId } : {}),
      });
      if (error) console.error("Legacy active-account transaction failed", { rowNumber: account.rowNumber, code: error.code, message: error.message });
    }
    return jsonOk({ outcomes });
  } catch (error) {
    return handleApiError(error);
  }
}
