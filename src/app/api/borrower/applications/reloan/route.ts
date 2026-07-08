import { writeAuditEvent } from "@/lib/audit/writer";
import { mapBorrowerRow } from "@/lib/borrowers/types";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { ensureDocumentSlots } from "@/lib/documents/checklist";
import {
  ForbiddenError,
  requireModulePermission,
} from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

async function getOwnBorrower(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("borrowers")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new ForbiddenError("Borrower profile not found");
  }

  return data;
}

export async function POST() {
  try {
    const user = await requireModulePermission("borrower_portal", "create");
    const supabase = await createClient();
    const borrower = await getOwnBorrower(user.id);

    const { data: latestApp } = await supabase
      .from("loan_applications")
      .select("id")
      .eq("borrower_id", borrower.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: application, error: applicationError } = await supabase
      .from("loan_applications")
      .insert({
        borrower_id: borrower.id,
        status: "documents_pending",
        status_history: [
          {
            status: "documents_pending",
            at: new Date().toISOString(),
            actorId: user.id,
            note: "Reloan application",
          },
        ],
        is_reloan: true,
        parent_application_id: latestApp?.id ?? null,
      })
      .select(
        "id, status, status_history, is_reloan, parent_application_id, created_at",
      )
      .single();

    if (applicationError || !application) {
      throw new Error(
        applicationError?.message ?? "Failed to create reloan application",
      );
    }

    await ensureDocumentSlots(
      supabase,
      "intake",
      application.id,
      borrower.id,
    );

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "borrower_portal",
      action: "create",
      entityType: "loan_application",
      entityId: application.id,
      afterData: {
        isReloan: true,
        parentApplicationId: latestApp?.id ?? null,
        borrowerNo: borrower.borrower_no,
      },
    });

    return jsonOk(
      {
        application: {
          id: application.id,
          status: application.status,
          statusHistory: application.status_history,
          isReloan: application.is_reloan,
          parentApplicationId: application.parent_application_id,
          createdAt: application.created_at,
        },
        profile: mapBorrowerRow(borrower),
      },
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}
