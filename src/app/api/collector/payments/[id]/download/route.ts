import { handleApiError, jsonOk } from "@/lib/api/handler";
import { createSignedDownloadUrl } from "@/lib/documents/storage";
import {
  ForbiddenError,
  NotFoundError,
  hasModulePermission,
  isSuperAdmin,
  requireAuth,
} from "@/lib/permissions/server";
import {
  canReviewAssignedPayment,
  getPaymentReviewContext,
} from "@/lib/notifications/workflow-recipients";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireAuth();
    const [canCollect, canRemedial, superAdmin] = await Promise.all([
      hasModulePermission("collection", "view", user.id),
      hasModulePermission("remedial", "view", user.id),
      isSuperAdmin(user.id),
    ]);
    if (!canCollect && !canRemedial && !superAdmin) {
      throw new ForbiddenError("Payment not found");
    }
    const { id } = await params;
    const supabase = await createClient();

    const { data: payment, error } = await supabase
      .from("payments")
      .select("id, masterlist_id, storage_path, file_name")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!payment || !payment.storage_path) {
      throw new NotFoundError(
        payment ? "No file attached to this payment proof" : "Payment not found",
      );
    }

    const context = await getPaymentReviewContext(supabase, id);
    if (
      !context ||
      !canReviewAssignedPayment(user.id, context.assignment, superAdmin)
    ) {
      throw new ForbiddenError("Payment not found");
    }

    const signedUrl = await createSignedDownloadUrl(
      supabase,
      payment.storage_path as string,
    );
    return jsonOk({
      signedUrl,
      fileName: (payment.file_name as string | null) ?? null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
