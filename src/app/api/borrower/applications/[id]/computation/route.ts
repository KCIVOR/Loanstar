import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { getActiveComputation } from "@/lib/csa/computation";
import {
  getNegotiation,
  listNegotiationMessages,
  logAcceptance,
  queueForLra,
  withAuthorNames,
} from "@/lib/negotiation/service";
import {
  ForbiddenError,
  requireModulePermission,
} from "@/lib/permissions/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

async function assertOwnApplication(userId: string, applicationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("loan_applications")
    .select("id, status, borrowers!inner ( user_id )")
    .eq("id", applicationId)
    .single();

  if (error || !data) {
    throw new ForbiddenError("Application not found");
  }

  const borrowersRaw = data.borrowers;
  const borrower = Array.isArray(borrowersRaw) ? borrowersRaw[0] : borrowersRaw;

  if (borrower?.user_id !== userId) {
    throw new ForbiddenError("Application not found");
  }

  return data;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("borrower_portal", "view");
    const { id } = await params;
    await assertOwnApplication(user.id, id);
    const supabase = await createClient();
    const computation = await getActiveComputation(supabase, id);
    const negotiation = await getNegotiation(supabase, id);
    const messages = await withAuthorNames(
      await listNegotiationMessages(supabase, id),
    );

    if (!computation) {
      return jsonOk({ computation: null, negotiation, negotiationMessages: messages });
    }

    return jsonOk({
      negotiation: negotiation
        ? { status: negotiation.status, currentAmount: negotiation.currentAmount }
        : null,
      negotiationMessages: messages,
      computation: {
        id: computation.id,
        inputMode: computation.inputMode,
        inputAmount: computation.inputAmount,
        terms: computation.terms,
        addonMonths: computation.addonMonths,
        principal: computation.principal,
        netReleased: computation.netReleased,
        totalLoan: computation.totalLoan,
        monthlyAmortization: computation.monthlyAmortization,
        lineItems: computation.lineItems,
        firstPaymentDate: computation.firstPaymentDate,
        signedAt: computation.signedAt,
        loanTypeName: computation.loanTypeName,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const signSchema = z.object({
  confirm: z.literal(true),
});

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("borrower_portal", "edit");
    const { id } = await params;
    signSchema.parse(await request.json());
    const supabase = await createClient();
    await assertOwnApplication(user.id, id);
    const negotiation = await getNegotiation(supabase, id);

    if (negotiation && negotiation.status !== "awaiting_signature") {
      return NextResponse.json(
        { error: "Approved terms must be disclosed before you can sign" },
        { status: 400 },
      );
    }

    const computation = await getActiveComputation(supabase, id);
    if (!computation) {
      return NextResponse.json(
        { error: "No computation available to sign" },
        { status: 400 },
      );
    }

    if (computation.signedAt) {
      // Stale intake signature after disclose: RLS can leave signed_at set
      // while negotiation is still awaiting_signature. Clear and continue.
      if (negotiation?.status === "awaiting_signature") {
        const admin = createServiceClient();
        const { error: clearError } = await admin
          .from("computations")
          .update({
            signed_at: null,
            signed_by: null,
            signature_hash: null,
          })
          .eq("id", computation.id);
        if (clearError) {
          throw new Error(clearError.message);
        }
      } else {
        return NextResponse.json(
          { error: "Computation already signed" },
          { status: 400 },
        );
      }
    }

    const signatureHash = createHash("sha256")
      .update(JSON.stringify(computation))
      .digest("hex");
    const signedAt = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("computations")
      .update({
        signed_at: signedAt,
        signed_by: user.id,
        signature_hash: signatureHash,
      })
      .eq("id", computation.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    if (negotiation && negotiation.status === "awaiting_signature") {
      await logAcceptance(
        supabase,
        id,
        user.id,
        "borrower",
        computation.netReleased,
        "Signed and accepted the disclosed computation.",
      );
      await queueForLra(supabase, id, computation.id, user.id);
    }

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "borrower_portal",
      action: "execute_trigger",
      entityType: "computation",
      entityId: computation.id,
      afterData: {
        applicationId: id,
        signatureHash,
        trigger: "borrower_sign_computation",
      },
    });

    return jsonOk({
      signedAt,
      signatureHash,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
