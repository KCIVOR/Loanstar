import { NextResponse } from "next/server";
import { z } from "zod";

import { formatStatusLabel } from "@/lib/applications/status";
import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  assertCsaCanEdit,
  getApplicationForStaff,
  getEndorseReadiness,
  isCsaEditableStatus,
} from "@/lib/csa/application";
import { getActiveComputation } from "@/lib/csa/computation";
import {
  borrowerProfileToRow,
  mapBorrowerRow,
  type BorrowerRow,
} from "@/lib/borrowers/types";
import { getNegotiation } from "@/lib/negotiation/service";
import { getStageChecklist } from "@/lib/documents/checklist";
import {
  requireModulePermission,
} from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  borrower: z
    .object({
      firstName: z.string().optional(),
      middleName: z.string().nullable().optional(),
      lastName: z.string().optional(),
      suffix: z.string().nullable().optional(),
      dateOfBirth: z.string().nullable().optional(),
      placeOfBirth: z.string().nullable().optional(),
      citizenship: z.string().nullable().optional(),
      civilStatus: z.string().nullable().optional(),
      gender: z.string().nullable().optional(),
      mobilePhone: z.string().nullable().optional(),
      landline: z.string().nullable().optional(),
      presentAddress: z.record(z.string(), z.unknown()).optional(),
      permanentAddress: z.record(z.string(), z.unknown()).optional(),
      manningAgency: z.record(z.string(), z.unknown()).optional(),
      financial: z.record(z.string(), z.unknown()).optional(),
      allottee: z.record(z.string(), z.unknown()).optional(),
      picWork: z.record(z.string(), z.unknown()).optional(),
      dependents: z.array(z.record(z.string(), z.unknown())).optional(),
      references: z.array(z.record(z.string(), z.unknown())).optional(),
    })
    .optional(),
  details: z
    .object({
      loanTypeId: z.string().uuid().nullable().optional(),
      internalFlags: z.record(z.string(), z.unknown()).optional(),
      staffNotes: z.string().nullable().optional(),
    })
    .optional(),
});

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await requireModulePermission("intake", "view");
    const { id } = await params;
    const supabase = await createClient();
    const application = await getApplicationForStaff(supabase, id);
    const borrowerRaw = application.borrowers;
    const borrowerRow = (
      Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw
    ) as BorrowerRow | null;

    const { data: details } = await supabase
      .from("application_details")
      .select("*")
      .eq("loan_application_id", id)
      .maybeSingle();

    const checklist = await getStageChecklist(supabase, "intake", id);
    const computation = await getActiveComputation(supabase, id);
    const endorseReadiness = await getEndorseReadiness(supabase, id);
    const negotiation = await getNegotiation(supabase, id);

    return jsonOk({
      application: {
        id: application.id,
        applicationNo: application.application_no,
        status: application.status,
        statusLabel: formatStatusLabel(application.status),
        statusHistory: application.status_history,
        blocker: application.blocker,
        isReloan: application.is_reloan,
        endorsedAt: application.endorsed_at,
        createdAt: application.created_at,
        updatedAt: application.updated_at,
        editable: isCsaEditableStatus(application.status),
      },
      borrower: borrowerRow ? mapBorrowerRow(borrowerRow) : null,
      details: details
        ? {
            loanTypeId: details.loan_type_id,
            internalFlags: details.internal_flags,
            staffNotes: details.staff_notes,
          }
        : null,
      checklist,
      computation,
      endorseReadiness,
      negotiation,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("intake", "edit");
    const { id } = await params;
    const body = patchSchema.parse(await request.json());
    const supabase = await createClient();
    const application = await assertCsaCanEdit(supabase, id);

    if (body.borrower) {
      const row = borrowerProfileToRow({
        firstName: body.borrower.firstName,
        middleName: body.borrower.middleName ?? undefined,
        lastName: body.borrower.lastName,
        suffix: body.borrower.suffix ?? undefined,
        dateOfBirth: body.borrower.dateOfBirth ?? undefined,
        placeOfBirth: body.borrower.placeOfBirth ?? undefined,
        citizenship: body.borrower.citizenship ?? undefined,
        civilStatus: body.borrower.civilStatus ?? undefined,
        gender: body.borrower.gender ?? undefined,
        mobilePhone: body.borrower.mobilePhone ?? undefined,
        landline: body.borrower.landline ?? undefined,
        presentAddress: body.borrower.presentAddress as never,
        permanentAddress: body.borrower.permanentAddress as never,
        manningAgency: body.borrower.manningAgency as never,
        financial: body.borrower.financial as never,
        allottee: body.borrower.allottee as never,
        picWork: body.borrower.picWork as never,
        dependents: body.borrower.dependents as never,
        references: body.borrower.references,
      });

      const { error: borrowerError } = await supabase
        .from("borrowers")
        .update(row)
        .eq("id", application.borrower_id);

      if (borrowerError) {
        throw new Error(borrowerError.message);
      }
    }

    if (body.details) {
      const { error: detailsError } = await supabase
        .from("application_details")
        .upsert({
          loan_application_id: id,
          loan_type_id: body.details.loanTypeId ?? null,
          internal_flags: body.details.internalFlags ?? {},
          staff_notes: body.details.staffNotes ?? null,
          updated_at: new Date().toISOString(),
        });

      if (detailsError) {
        throw new Error(detailsError.message);
      }
    }

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "intake",
      action: "update",
      entityType: "loan_application",
      entityId: id,
      afterData: body,
    });

    return jsonOk({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
