export type CommitteeVoteValue = "approve" | "deny";

export type VoteRecord = {
  id: string;
  voterId: string;
  vote: CommitteeVoteValue;
  votedAt: string;
  comment: string | null;
};

export type VoteTally = {
  approve: number;
  deny: number;
  total: number;
  label: string | null;
  hasMajority: boolean;
};

export const COMMITTEE_SIZE = 3;

/** Server-side gate: every final action requires a full committee ballot. */
export function assertAllVotesCast(votes: VoteRecord[]): void {
  if (votes.length < COMMITTEE_SIZE) {
    throw new Error(
      "All 3 committee votes must be cast before a final action",
    );
  }
}

export function computeVoteTally(votes: VoteRecord[]): VoteTally {
  const approve = votes.filter((v) => v.vote === "approve").length;
  const deny = votes.filter((v) => v.vote === "deny").length;
  const total = votes.length;

  let label: string | null = null;
  let hasMajority = false;

  if (approve >= 2) {
    label = `${approve}/${COMMITTEE_SIZE} — Approve`;
    hasMajority = true;
  } else if (deny >= 2) {
    label = `${deny}/${COMMITTEE_SIZE} — Deny`;
    hasMajority = true;
  }

  return { approve, deny, total, label, hasMajority };
}

export function computeTatDays(
  forwardedAt: string | null,
  finalActionAt: string | null,
): number | null {
  if (!forwardedAt) return null;
  const start = new Date(forwardedAt);
  const end = finalActionAt ? new Date(finalActionAt) : new Date();
  const diffMs = end.getTime() - start.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/** TAT thresholds per LoanStar_System_Design.md §6.13: warning at 5+, danger at 10+. */
export function tatTone(
  days: number | null,
): "success" | "warning" | "danger" | "neutral" {
  if (days == null) return "neutral";
  if (days >= 10) return "danger";
  if (days >= 5) return "warning";
  return "success";
}
