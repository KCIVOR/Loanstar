import { handleApiError, jsonOk } from "@/lib/api/handler";
import { createSignedDownloadUrl } from "@/lib/documents/storage";
import {
  ForbiddenError,
  NotFoundError,
  requireModulePermission,
} from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("collection", "view");
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

    const { data: assignment } = await supabase
      .from("assignments")
      .select("id")
      .eq("masterlist_id", payment.masterlist_id)
      .eq("collector_user_id", user.id)
      .maybeSingle();

    if (!assignment) {
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
