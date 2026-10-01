import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, jsonOk } from "@/lib/api/handler";
import { formatZodError } from "@/lib/api/zod-error";
import { fetchAuditPage, parseAuditFilters } from "@/lib/audit/query";
import { resolveAuditRows, type AuditEventRow } from "@/lib/audit/resolve";
import { requireModulePermission } from "@/lib/permissions/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Activity Log feed. Permission is checked first; the service client is then
 * used so audit viewers can see staff and borrower names that profile /
 * borrower RLS would otherwise hide from them.
 */
export async function GET(request: Request) {
  try {
    await requireModulePermission("audit_log", "view");
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 50) || 50, 1), 200);
    const offset = Math.max(Number(searchParams.get("offset") ?? 0) || 0, 0);
    const filters = parseAuditFilters(searchParams);
    const service = createServiceClient();

    // People list for the "Person" filter, sent with the first page only.
    let actors: Array<{ id: string; name: string }> | undefined;
    if (offset === 0) {
      const { data: people } = await service
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name")
        .limit(1000);
      actors = ((people ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map(
        (p) => ({ id: p.id, name: p.full_name?.trim() || p.email || "Unnamed user" }),
      );
    }

    const result = await fetchAuditPage(service, filters, {
      count: true,
      start: offset,
      end: offset + limit - 1,
    });
    if (!result) return jsonOk({ events: [], total: 0, limit, offset, actors });

    const { data, error, count } = result;
    if (error) throw new Error(error.message);

    const events = await resolveAuditRows(service, (data ?? []) as AuditEventRow[]);
    return jsonOk({ events, total: count ?? 0, limit, offset, actors });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: formatZodError(error) }, { status: 400 });
    }
    return handleApiError(error);
  }
}
