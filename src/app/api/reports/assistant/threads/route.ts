import { handleApiError, jsonOk } from "@/lib/api/handler";
import { requireModulePermission } from "@/lib/permissions/server";
import { parseStoredMessages } from "@/lib/reports/assistant/threads";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const user = await requireModulePermission("reports", "view");
    const admin = createServiceClient();
    const { data, error } = await admin
      .from("reports_assistant_threads")
      .select("id, title, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return jsonOk({
      threads: (data ?? []).map((row) => ({
        id: row.id as string,
        title: row.title as string,
        updatedAt: row.updated_at as string,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST() {
  try {
    const user = await requireModulePermission("reports", "view");
    const admin = createServiceClient();
    const { data, error } = await admin
      .from("reports_assistant_threads")
      .insert({ user_id: user.id, title: "New chat", messages: [] })
      .select("id, title, messages, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return jsonOk(
      {
        id: data.id as string,
        title: data.title as string,
        messages: parseStoredMessages(data.messages),
        updatedAt: data.updated_at as string,
      },
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}
