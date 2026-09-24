import { handleApiError, jsonOk } from "@/lib/api/handler";
import { buildLeadsWidget, WIDGET_BUILDERS } from "@/lib/dashboard/aggregates";
import { resolveDashboardScope } from "@/lib/dashboard/scope";
import type { WidgetsResponse, WidgetSlug } from "@/lib/dashboard/types";
import { getUserPermissions, requireAuth } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const user = await requireAuth();
    const permissions = await getUserPermissions(user.id);
    const scope = resolveDashboardScope(permissions);
    const supabase = await createClient();

    const viewable = permissions.modules
      .filter((m) => m.canView)
      .map((m) => m.moduleSlug)
      .filter((slug): slug is WidgetSlug => slug in WIDGET_BUILDERS);

    const results = await Promise.allSettled(
      viewable.map((slug) =>
        // `leads` is identity-sensitive (Agent-scoped analytics): call it
        // directly with the trusted, server-resolved scope instead of
        // routing it through the generic unscoped builder map.
        slug === "leads" ? buildLeadsWidget(supabase, scope) : WIDGET_BUILDERS[slug](supabase),
      ),
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
