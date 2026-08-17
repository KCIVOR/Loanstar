import { handleApiError, jsonOk } from "@/lib/api/handler";
import { METRICS } from "@/lib/reports/metrics/registry";
import { requireModulePermission } from "@/lib/permissions/server";

/**
 * The semantic layer for the reports dashboard — every metric's static
 * definition (label, description, formula, unit, direction, theme), never a
 * value. Pairs with `GET /api/reports/dashboard`, which returns the values:
 * an AI reading both can narrate the dashboard or answer questions about it
 * without re-deriving anything from the schema.
 */
export async function GET() {
  try {
    await requireModulePermission("reports", "view");
    return jsonOk({ definitions: METRICS });
  } catch (error) {
    return handleApiError(error);
  }
}
