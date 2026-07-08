import { NextResponse } from "next/server";
import { z } from "zod";

import { appendStatusHistory } from "@/lib/applications/status";
import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { isCsaEditableStatus } from "@/lib/csa/application";
import {
  borrowerProfileToRow,
  mapBorrowerRow,
  type BorrowerRow,
} from "@/lib/borrowers/types";
import { ensureDocumentSlots } from "@/lib/documents/checklist";
import {
  requireModulePermission,
} from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

const createSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  middleName: z.string().optional(),
  mobilePhone: z.string().optional(),
});

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
    const body = createSchema.parse(await request.json());
    const supabase = await createClient();

    const { data: existingBorrower } = await supabase
      .from("borrowers")
      .select("id")
      .eq("email", body.email.toLowerCase())
      .maybeSingle();

    let borrowerId = existingBorrower?.id;

    if (!borrowerId) {
      const { data: createdBorrower, error: borrowerError } = await supabase
        .from("borrowers")
        .insert({
          email: body.email.toLowerCase(),
          first_name: body.firstName,
          middle_name: body.middleName ?? null,
          last_name: body.lastName,
          mobile_phone: body.mobilePhone ?? null,
        })
        .select("id")
        .single();

      if (borrowerError) {
        throw new Error(borrowerError.message);
      }
      borrowerId = createdBorrower.id;
    }

    const { data: application, error: appError } = await supabase
      .from("loan_applications")
      .insert({
        borrower_id: borrowerId,
        status: "submitted",
        status_history: [
          {
            status: "submitted",
            at: new Date().toISOString(),
            actorId: user.id,
            note: "CSA created application",
          },
        ],
      })
      .select("id, status, created_at")
      .single();

    if (appError) {
      throw new Error(appError.message);
    }

    await supabase.from("application_details").upsert({
      loan_application_id: application.id,
      internal_flags: {},
    });

    await ensureDocumentSlots(supabase, "intake", application.id, borrowerId);

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "intake",
      action: "create",
      entityType: "loan_application",
      entityId: application.id,
      afterData: { borrowerId, email: body.email },
    });

    return jsonOk({ applicationId: application.id }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
