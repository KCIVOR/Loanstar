import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { castCommitteeVote, getCommitteeVotes } from "@/lib/committee/actions";
import { computeVoteTally } from "@/lib/committee/votes";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const voteSchema = z.object({
  vote: z.enum(["approve", "deny"]),
});

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("committee", "edit");
    const { id } = await params;
    const body = voteSchema.parse(await request.json());
    const supabase = await createClient();

    const votes = await castCommitteeVote(supabase, id, user.id, body.vote);
    const tally = computeVoteTally(votes);

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "committee",
      action: "update",
      entityType: "committee_vote",
      entityId: id,
      afterData: { vote: body.vote, tally },
    });

    return jsonOk({ votes, tally });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await requireModulePermission("committee", "view");
    const { id } = await params;
    const supabase = await createClient();
    const votes = await getCommitteeVotes(supabase, id);
    return jsonOk({ votes, tally: computeVoteTally(votes) });
  } catch (error) {
    return handleApiError(error);
  }
}
