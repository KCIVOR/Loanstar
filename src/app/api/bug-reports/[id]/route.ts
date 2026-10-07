import { NextResponse } from "next/server";

import { handleApiError } from "@/lib/api/handler";
import { bugStatusSchema } from "@/lib/bug-reports/schema";
import { notifyUser } from "@/lib/notifications/write";
import { ForbiddenError, isSuperAdmin, requireAuth } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth();
    if (!(await isSuperAdmin(user.id))) throw new ForbiddenError();
    const parsed = bugStatusSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid status or resolution note." }, { status: 400 });
    }

    const { id } = await params;
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("bug_reports")
      .update(parsed.data)
      .eq("id", id)
      .select("id, reporter_id, title, description, expected_behavior, location, error_message, severity, status, resolution_note, created_at, updated_at, bug_report_images(id, file_name)")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Report not found" }, { status: 404 });

    await notifyUser({
      userId: data.reporter_id,
      title: "Bug report updated",
      body: `Your report “${data.title}” is now ${data.status.replace("_", " ")}.`,
      link: "/bug-reports",
      kind: "bug_report",
      entityType: "bug_report",
      entityId: data.id,
    });
    return NextResponse.json({ report: data });
  } catch (error) {
    return handleApiError(error);
  }
}
