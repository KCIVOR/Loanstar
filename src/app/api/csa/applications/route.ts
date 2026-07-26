import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  createApplicationSchema,
  createCsaApplication,
} from "@/lib/csa/create-application";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    await requireModulePermission("intake", "view");
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("loan_applications")
      .select(
        `
        id,
        application_no,
        status,
        blocker,
        is_reloan,
        created_at,
        updated_at,
        borrowers (
          id,
          borrower_no,
          first_name,
          last_name,
          email
        )
      `,
      )
      .in("status", [
        "registered",
        "documents_pending",
        "submitted",
        "on_hold",
        "for_revision",
        "approved",
        "awaiting_confirmation",
        "negotiating_terms",
      ])
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    const applications = (data ?? []).map((row) => {
      const borrower = Array.isArray(row.borrowers)
        ? row.borrowers[0]
        : row.borrowers;
      return {
        id: row.id,
        applicationNo: row.application_no,
        status: row.status,
        blocker: row.blocker,
        isReloan: row.is_reloan,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        borrower: borrower
          ? {
              id: borrower.id,
              borrowerNo: borrower.borrower_no,
              firstName: borrower.first_name,
              lastName: borrower.last_name,
              email: borrower.email,
            }
          : null,
      };
    });

    return jsonOk({ applications });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireModulePermission("intake", "create");
    const body = createApplicationSchema.parse(await request.json());
    const supabase = await createClient();
    const result = await createCsaApplication(supabase, user.id, body);
    return jsonOk({ applicationId: result.applicationId }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
