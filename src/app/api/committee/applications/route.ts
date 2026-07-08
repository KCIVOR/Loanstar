import { computeTatDays } from "@/lib/committee/votes";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    await requireModulePermission("committee", "view");
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("loan_applications")
      .select(
        `
        id,
        application_no,
        status,
        endorsed_at,
        created_at,
        updated_at,
        borrowers (
          borrower_no,
          first_name,
          last_name,
          email
        ),
        verifications (
          finding,
          forwarded_at,
          completed_at
        )
      `,
      )
      .in("status", ["for_approval", "negotiating_terms"])
      .order("updated_at", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    const applications = (data ?? []).map((row) => {
      const borrower = Array.isArray(row.borrowers)
        ? row.borrowers[0]
        : row.borrowers;
      const verification = Array.isArray(row.verifications)
        ? row.verifications[0]
        : row.verifications;

      return {
        id: row.id,
        applicationNo: row.application_no,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        tatDays: computeTatDays(
          verification?.forwarded_at ?? null,
          null,
        ),
        borrower: borrower
          ? {
              borrowerNo: borrower.borrower_no,
              firstName: borrower.first_name,
              lastName: borrower.last_name,
              email: borrower.email,
            }
          : null,
        verification: verification
          ? {
              finding: verification.finding,
              forwardedAt: verification.forwarded_at,
              completedAt: verification.completed_at,
            }
          : null,
      };
    });

    return jsonOk({ applications });
  } catch (error) {
    return handleApiError(error);
  }
}
