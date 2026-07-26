import { handleApiError, jsonOk } from "@/lib/api/handler";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    await requireModulePermission("collection", "view");
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("release_files")
      .select(
        `
        id,
        status,
        release_path,
        updated_at,
        loan_applications (
          id,
          application_no,
          status,
          borrowers (
            borrower_no,
            first_name,
            last_name
          )
        ),
        briefings (
          acknowledged_at,
          checklist
        )
      `,
      )
      .eq("status", "awaiting_briefing")
      .order("updated_at", { ascending: true });

    if (error) throw new Error(error.message);

    const items = (data ?? []).map((row) => {
      const appRaw = row.loan_applications;
      const app = Array.isArray(appRaw) ? appRaw[0] : appRaw;
      const borrowerRaw = app?.borrowers;
      const borrower = Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw;
      const briefingRaw = row.briefings;
      const briefing = Array.isArray(briefingRaw) ? briefingRaw[0] : briefingRaw;

      return {
        releaseFileId: row.id as string,
        releasePath: (row.release_path as string | null) ?? null,
        updatedAt: row.updated_at as string,
        application: app
          ? {
              id: app.id as string,
              applicationNo: (app.application_no as string | null) ?? null,
              status: app.status as string,
            }
          : null,
        borrower: borrower
          ? {
              borrowerNo: borrower.borrower_no as string,
              firstName: borrower.first_name as string,
              lastName: borrower.last_name as string,
            }
          : null,
        briefing: briefing
          ? {
              acknowledgedAt: (briefing.acknowledged_at as string | null) ?? null,
              checklist: briefing.checklist,
            }
          : null,
      };
    });

    return jsonOk({ items });
  } catch (error) {
    return handleApiError(error);
  }
}
