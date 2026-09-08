import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, jsonOk } from "@/lib/api/handler";
import { writeAuditEvent } from "@/lib/audit/writer";
import { daysPastDue } from "@/lib/ar/schedule";
import { formatDateLocal } from "@/lib/computation/release-date";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const schema = z.object({
  daysPastDue: z.number().int().min(1).max(365),
});

/**
 * Dev/test tool only — lets AR/Remedial staff exercise the real delinquency
 * path (aging bucket, penalty accrual, 30-day rollover, remedial_flag) on a
 * real test account without waiting real calendar days. Backdates every
 * still-open (not paid, not rolled) installment's due_date by a fixed shift
 * so the earliest one lands exactly `daysPastDue` days overdue as of today,
 * preserving the spacing between installments, then runs the same
 * `refresh_one_masterlist_aging` SQL function the nightly cron
 * (`refresh_all_aging`) uses in production — no parallel/fake penalty logic.
 * This mutates real schedule rows; it is not reversible by
 * this tool (there is no "undo" — re-run a real release or fix dates by hand
 * if a demo account needs to be reset).
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("accounting_ar", "edit");
    const { id } = await params;
    const body = schema.parse(await request.json());
    const supabase = await createClient();

    const { data: allSchedules, error: scheduleError } = await supabase
      .from("amortization_schedules")
      .select("id, due_date, status")
      .eq("masterlist_id", id)
      .order("due_date");

    if (scheduleError) {
      throw new Error(`Failed to load schedule: ${scheduleError.message}`);
    }
    // The shift is sized off the earliest still-open installment (so it lands
    // exactly `daysPastDue` overdue) but is applied to EVERY installment,
    // including 'rolled' and 'paid' ones. Shifting only the open subset left
    // already-rolled rows frozen at their old dates while the next open one was
    // dragged backwards on top of them — re-running the tool then stacked
    // several installments onto one calendar date (observed live: installments
    // #1-#4 all collapsed onto 2026-05-22). Moving the whole schedule together
    // preserves the real month-to-month spacing no matter how often this runs.
    const schedules = allSchedules ?? [];
    const openSchedules = schedules.filter(
      (row) => row.status !== "rolled" && row.status !== "paid",
    );
    if (openSchedules.length === 0) {
      return NextResponse.json(
        { error: "No open installments to backdate on this account." },
        { status: 400 },
      );
    }

    const earliest = openSchedules[0]!;
    const currentDpd = daysPastDue(earliest.due_date as string);
    const shiftDays = body.daysPastDue - currentDpd;

    for (const row of schedules) {
      const shifted = new Date(row.due_date as string);
      shifted.setDate(shifted.getDate() - shiftDays);
      await supabase
        .from("amortization_schedules")
        .update({ due_date: formatDateLocal(shifted) })
        .eq("id", row.id);
    }

    // Production path: the same SQL function the nightly `refresh_all_aging`
    // cron calls per account. `p_as_of` defaults to CURRENT_DATE in the DB.
    // The function returns void, so re-read the two fields the response and
    // the audit event report.
    const { error: refreshError } = await supabase.rpc(
      "refresh_one_masterlist_aging",
      { p_masterlist_id: id },
    );
    if (refreshError) {
      throw new Error(`Aging refresh failed: ${refreshError.message}`);
    }

    const { data: mlAfter, error: mlAfterError } = await supabase
      .from("masterlist")
      .select("aging_bucket, remedial_flag")
      .eq("id", id)
      .single();
    if (mlAfterError || !mlAfter) {
      throw new Error(
        mlAfterError?.message ?? "Masterlist not found after aging refresh",
      );
    }
    const result = {
      agingBucket: String(mlAfter.aging_bucket ?? ""),
      remedialFlag: Boolean(mlAfter.remedial_flag),
    };

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "accounting_ar",
      action: "execute_trigger",
      entityType: "dev_simulate_aging",
      entityId: id,
      afterData: {
        requestedDaysPastDue: body.daysPastDue,
        shiftDays,
        agingBucket: result.agingBucket,
        remedialFlag: result.remedialFlag,
      },
    });

    return jsonOk(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
