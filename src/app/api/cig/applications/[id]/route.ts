import { NextResponse } from "next/server";
import { z } from "zod";

import { formatStatusLabel } from "@/lib/applications/status";
import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { assertCigVerificationStage } from "@/lib/cig/queue";
import {
  saveVerificationPatch,
  tryAutoForwardToCommittee,
} from "@/lib/cig/forward";
import {
  assessVerificationCompleteness,
  getCigChecksComplete,
  getOrCreateVerification,
} from "@/lib/cig/verification";
import { getApplicationForStaff } from "@/lib/csa/application";
import { getActiveComputation } from "@/lib/csa/computation";
import {
  borrowerProfileToRow,
  mapBorrowerRow,
  type BorrowerRow,
} from "@/lib/borrowers/types";
import {
  ForbiddenError,
  requireModulePermission,
} from "@/lib/permissions/server";
import { validateFieldEdit } from "@/lib/permissions/field-rules";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  borrower: z
    .object({
      firstName: z.string().optional(),
      middleName: z.string().nullable().optional(),
      lastName: z.string().optional(),
      suffix: z.string().nullable().optional(),
    })
    .optional(),
  verification: z
    .object({
      fieldCompletenessOk: z.boolean().optional(),
      fieldCompletenessNotes: z.string().nullable().optional(),
      picAllotmentAwareness: z.string().optional(),
      picPaymentReliability: z.string().optional(),
      picInterviewNotes: z.string().nullable().optional(),
      cmDepartureDate: z.string().optional(),
      cmSalary: z.number().nullable().optional(),
      cmPosition: z.string().optional(),
      cmContractStatus: z.string().optional(),
      cmNotes: z.string().nullable().optional(),
      characterReferencesNotes: z.string().optional(),
      finding: z.enum(["positive", "negative"]).optional(),
      findingNotes: z.string().nullable().optional(),
    })
    .optional(),
});

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await requireModulePermission("verification", "view");
    const { id } = await params;
    const supabase = await createClient();

    const application = await getApplicationForStaff(supabase, id);
    const borrowerRaw = application.borrowers;
    const borrowerRow = (
      Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw
    ) as BorrowerRow | null;

    const verification = await getOrCreateVerification(supabase, id);
    const checks = await getCigChecksComplete(supabase, id);
    const completeness = assessVerificationCompleteness(
      verification,
      checks.complete,
      checks.missing,
    );
    const computation = await getActiveComputation(supabase, id);

    const { data: activeCallback } = await supabase
      .from("callbacks")
      .select("id, scheduled_at, notes")
      .eq("loan_application_id", id)
      .is("resolved_at", null)
      .order("scheduled_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return jsonOk({
      application: {
        id: application.id,
        applicationNo: application.application_no,
        status: application.status,
        statusLabel: formatStatusLabel(application.status),
        endorsedAt: application.endorsed_at,
        editable: application.status === "for_verification",
      },
      borrower: borrowerRow ? mapBorrowerRow(borrowerRow) : null,
      verification,
      completeness,
      computation: computation
        ? {
            principal: computation.principal,
            netReleased: computation.netReleased,
            totalLoan: computation.totalLoan,
            monthlyAmortization: computation.monthlyAmortization,
            lineItems: computation.lineItems,
            signedAt: computation.signedAt,
          }
        : null,
      activeCallback: activeCallback
        ? {
            id: activeCallback.id,
            scheduledAt: activeCallback.scheduled_at,
            notes: activeCallback.notes,
          }
        : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("verification", "edit");
    const { id } = await params;
    const body = patchSchema.parse(await request.json());
    const supabase = await createClient();
    await assertCigVerificationStage(supabase, id);
    const application = await getApplicationForStaff(supabase, id);

    if (body.borrower) {
      const borrowerFields = ["firstName", "middleName", "lastName", "suffix"] as const;
      for (const field of borrowerFields) {
        if (body.borrower[field] !== undefined) {
          const result = await validateFieldEdit(
            "verification",
            "borrower_info",
            user.id,
          );
          if (!result.allowed) {
            throw new ForbiddenError(result.reason);
          }
        }
      }

      const row = borrowerProfileToRow({
        firstName: body.borrower.firstName,
        middleName: body.borrower.middleName ?? undefined,
        lastName: body.borrower.lastName,
        suffix: body.borrower.suffix ?? undefined,
      });

      const { error: borrowerError } = await supabase
        .from("borrowers")
        .update(row)
        .eq("id", application.borrower_id);

      if (borrowerError) {
        throw new Error(borrowerError.message);
      }

      await writeAuditEvent({
        actorId: user.id,
        moduleSlug: "verification",
        action: "update",
        entityType: "borrower",
        entityId: application.borrower_id as string,
        afterData: body.borrower,
      });
    }

    if (body.verification) {
      await saveVerificationPatch(supabase, id, body.verification);

      await writeAuditEvent({
        actorId: user.id,
        moduleSlug: "verification",
        action: "update",
        entityType: "verification",
        entityId: id,
        afterData: body.verification,
      });
    }

    const forward = await tryAutoForwardToCommittee(supabase, id, user.id);

    if (forward.forwarded) {
      await writeAuditEvent({
        actorId: user.id,
        moduleSlug: "verification",
        action: "execute_trigger",
        entityType: "loan_application",
        entityId: id,
        afterData: { trigger: "auto_forward_committee", status: "for_approval" },
      });
    }

    return jsonOk({
      success: true,
      forwarded: forward.forwarded,
      missing: forward.missing,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
