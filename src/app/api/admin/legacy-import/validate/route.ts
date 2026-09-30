import { handleApiError, jsonOk, ValidationError } from "@/lib/api/handler";
import { requireSuperAdmin } from "@/lib/legacy-import/server";
import { validateRequestSchema } from "@/lib/legacy-import/schemas";
import { extractLegacyKeys, validateRows } from "@/lib/legacy-import/validate";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const LOOKUP_BATCH = 200;

/** Read-only existence lookup of legacy keys in a single column. */
async function existingValues(
  supabase: Supabase,
  table: "borrowers" | "loan_applications" | "masterlist",
  column: "borrower_no" | "application_no" | "loan_account_no",
  values: string[],
): Promise<string[]> {
  const found: string[] = [];
  for (let i = 0; i < values.length; i += LOOKUP_BATCH) {
    const batch = values.slice(i, i + LOOKUP_BATCH);
    const { data, error } = await supabase.from(table).select(column).in(column, batch);
    if (error) throw new Error(`Lookup on ${table}.${column} failed: ${error.message}`);
    for (const row of (data ?? []) as unknown as Record<string, string | null>[]) {
      const v = row[column];
      if (v) found.push(v);
    }
  }
  return found;
}

/**
 * Dry-run validation of one chunk of mapped rows. Performs only SELECTs;
 * never writes borrowers / loan_applications / computations / masterlist /
 * pdc_checks. File-wide duplicate detection is done by the caller across
 * chunks with the same pure `flagDuplicateLoanNos`.
 */
export async function POST(request: Request) {
  try {
    await requireSuperAdmin();
    const parsed = validateRequestSchema.safeParse(await request.json());
    if (!parsed.success) throw new ValidationError("Invalid validation request");
    const { segment, mapping, rows } = parsed.data;

    const supabase = await createClient();
    const keys = extractLegacyKeys(rows, mapping);
    const [borrowerNos, appNos, masterNos] = await Promise.all([
      existingValues(supabase, "borrowers", "borrower_no", keys.borrowerNos),
      existingValues(supabase, "loan_applications", "application_no", keys.loanNos),
      existingValues(supabase, "masterlist", "loan_account_no", keys.loanNos),
    ]);

    const results = validateRows(rows, mapping, segment, {
      borrowerNos: new Set(borrowerNos),
      loanNos: new Set([...appNos, ...masterNos]),
    });
    return jsonOk({ results });
  } catch (error) {
    return handleApiError(error);
  }
}
