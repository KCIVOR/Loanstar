import { handleApiError, jsonOk } from "@/lib/api/handler";
import { WIDGET_BUILDERS } from "@/lib/dashboard/aggregates";
import type { WidgetsResponse, WidgetSlug } from "@/lib/dashboard/types";
import { getUserPermissions, requireAuth } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const user = await requireAuth();
    const permissions = await getUserPermissions(user.id);
    const supabase = await createClient();

    const viewable = permissions.modules
      .filter((m) => m.canView)
      .map((m) => m.moduleSlug)
      .filter((slug): slug is WidgetSlug => slug in WIDGET_BUILDERS);

    const results = await Promise.allSettled(
      viewable.map((slug) => WIDGET_BUILDERS[slug](supabase)),
    );

    const widgets: WidgetsResponse["widgets"] = {};
    viewable.forEach((slug, i) => {
      const result = results[i];
      widgets[slug] =
        result.status === "fulfilled" ? result.value : { error: true };
    });

    return jsonOk({
      widgets,
      generatedAt: new Date().toISOString(),
    } satisfies WidgetsResponse);
  } catch (error) {
    return handleApiError(error);
  }
}
