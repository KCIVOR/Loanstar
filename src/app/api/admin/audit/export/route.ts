import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError } from "@/lib/api/handler";
import { formatZodError } from "@/lib/api/zod-error";
import { auditEventsToCsv } from "@/lib/audit/csv";
import { fetchAuditPage, parseAuditFilters } from "@/lib/audit/query";
import { resolveAuditRows, type AuditEventRow } from "@/lib/audit/resolve";
import { writeAuditEvent } from "@/lib/audit/writer";
import { requireModulePermission } from "@/lib/permissions/server";
import { createServiceClient } from "@/lib/supabase/server";

const MAX_ROWS = 10_000;
const PAGE = 1000;

/** CSV download of the Activity Log with the page's filters. The download itself is logged. */
export async function GET(request: Request) {
  try {
    const user = await requireModulePermission("audit_log", "view");
    const filters = parseAuditFilters(new URL(request.url).searchParams);
    const service = createServiceClient();

    const rows: AuditEventRow[] = [];
    for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
      const result = await fetchAuditPage(service, filters, {
        start: offset,
        end: offset + PAGE - 1,
      });
      if (!result) break;
      const { data, error } = result;
      if (error) throw new Error(error.message);
      rows.push(...((data ?? []) as AuditEventRow[]));
      if (!data || data.length < PAGE) break;
    }

    const events = await resolveAuditRows(service, rows);
    const csv = auditEventsToCsv(events);

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "audit_log",
      action: "export",
      entityType: "audit_log",
      afterData: { trigger: "audit_log_export", rowCount: rows.length, filters },
    });

    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="activity-log-${stamp}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: formatZodError(error) }, { status: 400 });
    }
    return handleApiError(error);
  }
}
