import { formatStatusLabel } from "@/lib/applications/status";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  getLatestCommitteeAction,
  getCommitteeVotes,
} from "@/lib/committee/actions";
import { computeTatDays, computeVoteTally } from "@/lib/committee/votes";
import { getApplicationForStaff } from "@/lib/csa/application";
import { getActiveComputation } from "@/lib/csa/computation";
import { getNegotiation } from "@/lib/negotiation/service";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("committee", "view");
    const { id } = await params;
    const supabase = await createClient();

    const application = await getApplicationForStaff(supabase, id);
    const borrowerRaw = application.borrowers;
    const borrower = Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw;

    const { data: verification } = await supabase
      .from("verifications")
      .select("finding, finding_notes, forwarded_at, completed_at")
      .eq("loan_application_id", id)
      .maybeSingle();

    const votes = await getCommitteeVotes(supabase, id);
    const tally = computeVoteTally(votes);
    const latestAction = await getLatestCommitteeAction(supabase, id);
    const computation = await getActiveComputation(supabase, id);
    const negotiation = await getNegotiation(supabase, id);

    const myVote = votes.find((v) => v.voterId === user.id)?.vote ?? null;

    const tatDays = computeTatDays(
      verification?.forwarded_at ?? null,
      latestAction?.actedAt ?? null,
    );

    return jsonOk({
      application: {
        id: application.id,
        applicationNo: application.application_no,
        status: application.status,
        statusLabel: formatStatusLabel(application.status),
        blocker: application.blocker,
        canDecide: application.status === "for_approval",
        canOverride: application.status === "negotiating_terms",
      },
      borrower: borrower
        ? {
            borrowerNo: borrower.borrower_no,
            firstName: borrower.first_name,
            lastName: borrower.last_name,
            email: borrower.email,
          }
        : null,
      verification: verification
        ? {
            finding: verification.finding,
            findingNotes: verification.finding_notes,
            forwardedAt: verification.forwarded_at,
            completedAt: verification.completed_at,
          }
        : null,
      computation: computation
        ? {
            id: computation.id,
            inputMode: computation.inputMode,
            inputAmount: computation.inputAmount,
            principal: computation.principal,
            netReleased: computation.netReleased,
            totalLoan: computation.totalLoan,
            monthlyAmortization: computation.monthlyAmortization,
            lineItems: computation.lineItems,
            signedAt: computation.signedAt,
            loanTypeName: computation.loanTypeName,
            terms: computation.terms,
            addonMonths: computation.addonMonths,
          }
        : null,
      votes,
      tally,
      myVote,
      latestAction,
      negotiation,
      tatDays,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
