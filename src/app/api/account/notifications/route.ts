import { NextResponse } from "next/server";

import {
  countUnread,
  mapNotificationRow,
  parseMarkReadPatch,
} from "@/lib/notifications/inbox";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { requireAuth } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    const supabase = await createClient();
    const limitParam = new URL(request.url).searchParams.get("limit");
    const limit = Math.min(
      Math.max(Number(limitParam) || 20, 1),
      50,
    );

    const [{ data, error }, unreadRes] = await Promise.all([
      supabase
        .from("notifications")
        .select(
          "id, title, body, link, kind, entity_type, entity_id, read_at, created_at",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("read_at", null),
    ]);

    if (error) throw new Error(error.message);
    if (unreadRes.error) throw new Error(unreadRes.error.message);

    const notifications = (data ?? []).map((row) =>
      mapNotificationRow(row as Record<string, unknown>),
    );

    return jsonOk({
      notifications,
      unreadCount: unreadRes.count ?? countUnread(notifications),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireAuth();
    const patch = parseMarkReadPatch(await request.json());
    if (!patch) {
      return NextResponse.json(
        { error: "Provide { all: true } or { ids: string[] }" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const now = new Date().toISOString();

    let query = supabase
      .from("notifications")
      .update({ read_at: now })
      .eq("user_id", user.id)
      .is("read_at", null);

    if ("ids" in patch) {
      if (patch.ids.length === 0) {
        return jsonOk({ updated: 0 });
      }
      query = query.in("id", patch.ids);
    }

    const { data, error } = await query.select("id");
    if (error) throw new Error(error.message);

    return jsonOk({ updated: data?.length ?? 0 });
  } catch (error) {
    return handleApiError(error);
  }
}
