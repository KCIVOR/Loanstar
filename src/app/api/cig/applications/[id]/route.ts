import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveDisplayName } from "@/lib/account/display-name";
import { formatStatusLabel } from "@/lib/applications/status";
import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { assertCigVerificationStage } from "@/lib/cig/queue-guards";
import { saveVerificationPatch } from "@/lib/cig/forward";
import { getReceiptReadiness } from "@/lib/cig/receipt";
import {
  assertVerificationPatchAllowed,
  CigSequenceError,
  getCigSequenceState,
} from "@/lib/cig/sequence";
import {
  assessVerificationCompleteness,
  getCigChecksComplete,
  getOrCreateVerification,
} from "@/lib/cig/verification";
import { getApplicationForStaff } from "@/lib/csa/application";
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

// CI & References Form nested shapes (loanstar/docs/cig-references-form-plan.md,
// Phase 2). Field names/order follow CI AND REFERENCES FORM 1.xlsx, Sheet1.
const picAddressSchema = z.object({
  street: z.string().optional(),
  barangay: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  zipCode: z.string().optional(),
  ownership: z.enum(["owned", "rented"]).nullable().optional(),
  yearsOfStay: z.string().optional(),
});

const picSiblingSchema = z.object({
  name: z.string().optional(),
  age: z.string().optional(),
  occupation: z.string().optional(),
});

const picOtherFinancingSchema = z.object({
  hasOther: z.boolean().nullable(),
  company: z.string().optional(),
  financingOrBank: z.string().optional(),
  when: z.string().optional(),
  loanAmount: z.number().optional(),
  monthly: z.number().optional(),
  startEnd: z.string().optional(),
});

const picLoanFlagSchema = z.object({
  has: z.boolean().nullable(),
  loanAmount: z.number().optional(),
  monthlyAmort: z.number().optional(),
});

const picOtherVerificationCallsSchema = z.object({
  status: z.enum(["yes", "none"]).nullable(),
  company: z.string().optional(),
  wasLending: z.boolean().optional(),
  recalledLast3Months: z.boolean().optional(),
});

const picVerificationSchema = z.object({
  name: z.string().nullable().optional(),
  birthday: z.string().nullable().optional(),
  presentAddress: picAddressSchema.nullable().optional(),
  provincialAddress: picAddressSchema.nullable().optional(),
  contactNumber: z.string().nullable().optional(),
  relationToClient: z.string().nullable().optional(),
  otherNumber: z.string().nullable().optional(),
  sinceWhen: z.string().nullable().optional(),
  socialContact: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  companyName: z.string().nullable().optional(),
  companyYearsOfStay: z.string().nullable().optional(),
  companyPhone: z.string().nullable().optional(),
  siblings: z.array(picSiblingSchema).optional(),
  willAvailLoanAware: z.boolean().nullable().optional(),
  otherFinancing: picOtherFinancingSchema.nullable().optional(),
  housingLoan: picLoanFlagSchema.nullable().optional(),
  carLoan: picLoanFlagSchema.nullable().optional(),
  otherVerificationCalls: picOtherVerificationCallsSchema.nullable().optional(),
});

const referenceOtherVerificationCallsSchema = z.object({
  status: z.enum(["yes", "no"]).nullable(),
  company: z.string().optional(),
  recalledLast3Months: z.boolean().optional(),
});

const referenceVerificationSchema = z.object({
  name: z.string().nullable().optional(),
  age: z.string().nullable().optional(),
  work: z.string().nullable().optional(),
  relationToClient: z.string().nullable().optional(),
  howLongKnowClient: z.string().nullable().optional(),
  contactNumber: z.string().nullable().optional(),
  otherContactNumber: z.string().nullable().optional(),
  facebookAccount: z.string().nullable().optional(),
  firstTimeAsReference: z.boolean().nullable().optional(),
  otherVerificationCalls: referenceOtherVerificationCallsSchema
    .nullable()
    .optional(),
  remarks: z.string().nullable().optional(),
});

const verificationChecklistSchema = z.object({
  validateBorrowerInfo: z.boolean(),
  validatePicInfo: z.boolean(),
  presidePicObligationSpill: z.boolean(),
  verifiedCharacterReferences: z.boolean(),
});

const picPaymentPreferenceSchema = z.object({
  method: z
    .enum(["BDO", "PBB", "EASTWEST", "UCPB", "PERSONAL_CHECK", "BANK", "OTHERS"])
    .nullable(),
  bankSpecify: z.string().optional(),
  othersSpecify: z.string().optional(),
  remarks: z.string().optional(),
});

const picDemeanorSchema = z.array(
  z.enum(["cooperative", "arrogant", "hard_to_understand", "inconsistent"]),
);

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
      biIdentityConfirmed: z.boolean().optional(),
      biPurposeConfirmed: z.boolean().optional(),
      biDetailsConfirmed: z.boolean().optional(),
      biNotes: z.string().nullable().optional(),
      picAllotmentAwareness: z.string().optional(),
      picPaymentReliability: z.string().optional(),
      picInterviewNotes: z.string().nullable().optional(),
      cmDepartureDate: z.string().optional(),
      cmSalary: z.number().nullable().optional(),
      cmPosition: z.string().optional(),
      cmContractStatus: z.string().optional(),
      cmFitToWork: z.boolean().optional(),
      cmNotes: z.string().nullable().optional(),
      characterReferencesNotes: z.string().optional(),
      charRefOtherLenders: z.boolean().optional(),
      picVerification: picVerificationSchema.optional(),
      // Free add/remove list (like Siblings) — no fixed cap, mirroring the
      // CIG modal's UI (loanstar/docs/cig-references-form-plan.md).
      referenceVerifications: z.array(referenceVerificationSchema).optional(),
      verificationChecklist: verificationChecklistSchema.optional(),
      picPaymentPreference: picPaymentPreferenceSchema.optional(),
      picDemeanor: picDemeanorSchema.optional(),
      picRating: z.number().min(1).max(5).nullable().optional(),
      picRatingReason: z.string().nullable().optional(),
      cifVerifiedBy: z.string().nullable().optional(),
      cifVerifiedDate: z.string().nullable().optional(),
      finding: z.enum(["positive", "negative"]).optional(),
      findingNotes: z.string().nullable().optional(),
      fieldVisit: z
        .object({
          header: z.record(z.string(), z.unknown()).nullable().optional(),
          residence: z.record(z.string(), z.unknown()).nullable().optional(),
          business: z.record(z.string(), z.unknown()).nullable().optional(),
          recommendation: z.record(z.string(), z.unknown()).nullable().optional(),
        })
        .optional(),
      smeReloanVerification: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

function verificationScope(application: {
  segment?: string | null;
  is_reloan?: boolean | null;
}) {
  return {
    segment:
      application.segment === "sme" ? ("sme" as const) : ("seafarer" as const),
    isReloan: Boolean(application.is_reloan),
  };
}

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
    const scope = verificationScope(application);
    const completeness = assessVerificationCompleteness(
      verification,
      checks.complete,
      checks.missing,
      scope,
    );
    const sequence = getCigSequenceState(verification, checks.complete, scope);

    const { data: activeCallback } = await supabase
      .from("callbacks")
      .select("id, scheduled_at, notes")
      .eq("loan_application_id", id)
      .is("resolved_at", null)
      .order("scheduled_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const borrower = borrowerRow ? mapBorrowerRow(borrowerRow) : null;
    const receipt = await getReceiptReadiness(supabase, id, borrower);

    return jsonOk({
      application: {
        id: application.id,
        applicationNo: application.application_no,
        status: application.status,
        statusLabel: formatStatusLabel(application.status),
        endorsedAt: application.endorsed_at,
        blocker: application.blocker,
        editable: application.status === "for_verification",
        segment: scope.segment,
        isReloan: scope.isReloan,
      },
      borrower,
      verification,
      completeness,
      sequence,
      receipt,
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

    const scope = verificationScope(application);

    if (body.verification) {
      const current = await getOrCreateVerification(supabase, id);
      const checksBefore = await getCigChecksComplete(supabase, id);
      const sequence = getCigSequenceState(
        current,
        checksBefore.complete,
        scope,
      );
      assertVerificationPatchAllowed(
        body.verification as Record<string, unknown>,
        sequence,
      );

      if (body.verification.cifVerifiedBy !== undefined) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .maybeSingle();

        body.verification.cifVerifiedBy = resolveDisplayName(
          profile?.full_name as string | null | undefined,
          user.user_metadata?.full_name as string | undefined,
          user.email,
        );
      }

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

    // No auto-forward: CIG submits the CI report explicitly via
    // POST /api/cig/applications/[id]/forward once everything is complete.
    const verification = await getOrCreateVerification(supabase, id);
    const checks = await getCigChecksComplete(supabase, id);
    const completeness = assessVerificationCompleteness(
      verification,
      checks.complete,
      checks.missing,
      scope,
    );

    return jsonOk({
      success: true,
      completeness,
      sequence: getCigSequenceState(verification, checks.complete, scope),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof CigSequenceError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
