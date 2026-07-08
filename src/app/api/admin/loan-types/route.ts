import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { validatePfRate } from "@/lib/loan-types/g2";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    await requireModulePermission("system_config", "view");
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get("filter") ?? "all";
    const supabase = await createClient();

    let query = supabase
      .from("loan_types")
      .select(
        "id, name, interest_rate, pf_rate, is_active, effective_from, effective_to, enrolled_at, enrolled_by",
      )
      .order("name")
      .order("effective_from", { ascending: false });

    if (filter === "active") query = query.eq("is_active", true);
    if (filter === "inactive") query = query.eq("is_active", false);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return jsonOk({ loanTypes: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}

const createLoanTypeSchema = z.object({
  name: z.string().min(1).max(100),
  interestRate: z.number().min(0).max(1),
  pfRate: z.number().min(0).max(1),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  deactivatePrevious: z.boolean().default(true),
});

export async function POST(request: Request) {
  try {
    const user = await requireModulePermission("system_config", "create");
    const body = createLoanTypeSchema.parse(await request.json());

    const g2 = validatePfRate(body.pfRate);
    if (!g2.valid) {
      return NextResponse.json({ error: g2.reason }, { status: 400 });
    }

    const supabase = await createClient();

    if (body.deactivatePrevious) {
      const { error: deactivateError } = await supabase
        .from("loan_types")
        .update({
          is_active: false,
          effective_to: body.effectiveFrom,
        })
        .eq("name", body.name)
        .eq("is_active", true);
      if (deactivateError) throw new Error(deactivateError.message);
    }

    const { data: loanType, error } = await supabase
      .from("loan_types")
      .insert({
        name: body.name,
        interest_rate: body.interestRate,
        pf_rate: body.pfRate,
        is_active: true,
        effective_from: body.effectiveFrom,
        enrolled_by: user.id,
      })
      .select(
        "id, name, interest_rate, pf_rate, is_active, effective_from, effective_to, enrolled_at",
      )
      .single();

    if (error) throw new Error(error.message);

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "system_config",
      action: "create",
      entityType: "loan_type",
      entityId: loanType.id,
      afterData: loanType as unknown as Record<string, unknown>,
    });

    return jsonOk({ loanType }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
