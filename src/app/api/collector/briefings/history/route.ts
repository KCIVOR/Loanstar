import { handleApiError, jsonOk } from "@/lib/api/handler";
import type { BriefingHistoryRow } from "@/lib/collector/briefings";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

/** Briefings signed off by the current user (`briefings.acknowledged_by`). */
export async function GET() {
  try {
    const user = await requireModulePermission("briefings", "view");
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("briefings")
      .select(
        `
        id,
        release_file_id,
        acknowledged_at,
        checklist,
        release_files (
          status,
          release_paths,
          loan_applications (
            id,
            application_no,
            segment,
            borrowers (
              borrower_no,
              first_name,
              last_name
            )
          )
        )
      `,
      )
      .eq("acknowledged_by", user.id)
      .not("acknowledged_at", "is", null)
      .order("acknowledged_at", { ascending: false });

    if (error) throw new Error(error.message);

    const one = <T,>(v: T | T[] | null | undefined): T | null =>
      Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

    const rows: BriefingHistoryRow[] = (data ?? []).map((row) => {
      const file = one(row.release_files as unknown);
      const fileObj = file as {
        status: string;
        release_paths: string[] | null;
        loan_applications: unknown;
      } | null;
      const app = one(fileObj?.loan_applications) as {
        id: string;
        application_no: string | null;
        segment: "sme" | "seafarer" | "individual" | null;
        borrowers: unknown;
      } | null;
      const borrower = one(app?.borrowers) as {
        borrower_no: string;
        first_name: string;
        last_name: string;
      } | null;

      return {
        id: row.id as string,
        releaseFileId: row.release_file_id as string,
        acknowledgedAt: row.acknowledged_at as string,
        checklistCount: Array.isArray(row.checklist) ? row.checklist.length : 0,
        releaseStatus: fileObj?.status ?? null,
        releasePaths: Array.isArray(fileObj?.release_paths) ? fileObj.release_paths : [],
        applicationNo: app?.application_no ?? null,
        segment: app?.segment ?? null,
        borrowerNo: borrower?.borrower_no ?? null,
        borrowerName: borrower ? `${borrower.first_name} ${borrower.last_name}` : "—",
      };
    });

    return jsonOk({ rows });
  } catch (error) {
    return handleApiError(error);
  }
}
