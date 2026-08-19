import { handleApiError, jsonOk } from "@/lib/api/handler";
import { NotFoundError, requireModulePermission } from "@/lib/permissions/server";
import { parseStoredMessages } from "@/lib/reports/assistant/threads";
import { createServiceClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("reports", "view");
    const { id } = await params;
    const admin = createServiceClient();
    const { data, error } = await admin
      .from("reports_assistant_threads")
      .select("id, title, messages, updated_at")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new NotFoundError("Chat not found");
    return jsonOk({
      id: data.id as string,
      title: data.title as string,
      messages: parseStoredMessages(data.messages),
      updatedAt: data.updated_at as string,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("reports", "view");
    const { id } = await params;
    const admin = createServiceClient();
    const { data, error } = await admin
      .from("reports_assistant_threads")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new NotFoundError("Chat not found");
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
