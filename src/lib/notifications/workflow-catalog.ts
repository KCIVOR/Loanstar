/**
 * Single source of truth for workflow notifications: who is told, what they
 * read, and where it links. Pure (no server imports) so it can be unit-tested.
 * Dispatch lives in workflow-events.ts.
 */

export type WorkflowAudience =
  | { roles: string[] }
  | { borrower: true }
  /** The CSA who endorsed the file; falls back to every CSA. */
  | { endorserOrCsa: true };

export type WorkflowEventKey =
  | "application_endorsed_to_cig"
  | "application_submitted_by_borrower"
  | "computation_signed_by_borrower"
  | "document_uploaded_by_borrower"
  | "document_revision_requested"
  | "application_returned_to_csa"
  | "application_cancelled_staff"
  | "application_cancelled_borrower"
  | "application_forwarded_to_committee"
  | "revision_completed_for_committee"
  | "committee_approved_disclose_terms"
  | "committee_denied_call_needed"
  | "committee_revisit_csa"
  | "committee_revisit_cig"
  | "terms_disclosed"
  | "borrower_counter_offer"
  | "committee_amount_revised"
  | "counter_offer_accepted"
  | "negotiation_message_from_borrower"
  | "negotiation_message_from_committee"
  | "queued_for_lra"
  | "release_awaiting_briefing"
  | "release_ready_for_release"
  | "loan_released"
  | "release_closed_to_ar"
  | "loan_active"
  | "loan_paid_off";

export type WorkflowEventDef = {
  audience: WorkflowAudience;
  title: string;
  /** `label` is "AN300459 · Maria Ramos" (or a fallback); `detail` is optional context. */
  body: (label: string, detail?: string) => string;
  link: (applicationId: string) => string;
};

const withDetail = (text: string, detail?: string) =>
  detail ? `${text} ${detail}` : text;

export const WORKFLOW_EVENTS: Record<WorkflowEventKey, WorkflowEventDef> = {
  application_endorsed_to_cig: {
    audience: { roles: ["cig"] },
    title: "New application endorsed for verification",
    body: (label) =>
      `${label} was endorsed by CSA and is waiting in the CIG verification queue.`,
    link: (id) => `/cig/applications/${id}`,
  },
  application_submitted_by_borrower: {
    audience: { roles: ["csa"] },
    title: "Borrower submitted an application",
    body: (label) =>
      `${label} was submitted by the borrower and is ready for intake review.`,
    link: (id) => `/csa/applications/${id}`,
  },
  computation_signed_by_borrower: {
    audience: { roles: ["csa"] },
    title: "Borrower approved the computation",
    body: (label) =>
      `${label}: the borrower signed the loan computation. The file can move forward.`,
    link: (id) => `/csa/applications/${id}`,
  },
  document_uploaded_by_borrower: {
    audience: { roles: ["csa"] },
    title: "Borrower uploaded a document",
    body: (label, detail) =>
      withDetail(`${label}: a new document is ready for review.`, detail),
    link: (id) => `/csa/applications/${id}`,
  },
  document_revision_requested: {
    audience: { borrower: true },
    title: "A document needs revision",
    body: (_label, detail) =>
      withDetail(
        "A document on your application needs to be replaced. Please upload a new copy.",
        detail,
      ),
    link: (id) => `/borrower/applications/${id}`,
  },
  application_returned_to_csa: {
    audience: { endorserOrCsa: true },
    title: "Application returned to CSA",
    body: (label, detail) =>
      withDetail(`${label} was returned by CIG for correction.`, detail),
    link: (id) => `/csa/applications/${id}`,
  },
  application_cancelled_staff: {
    audience: { endorserOrCsa: true },
    title: "Application cancelled by CIG",
    body: (label, detail) =>
      withDetail(`${label} was cancelled during verification.`, detail),
    link: (id) => `/csa/applications/${id}`,
  },
  application_cancelled_borrower: {
    audience: { borrower: true },
    title: "Application cancelled",
    body: () =>
      "Your loan application was cancelled. Please contact Loan Star for guidance.",
    link: (id) => `/borrower/applications/${id}`,
  },
  application_forwarded_to_committee: {
    audience: { roles: ["committee"] },
    title: "Application ready for committee review",
    body: (label) => `${label} was verified by CIG and is waiting for the committee.`,
    link: (id) => `/committee/applications/${id}`,
  },
  revision_completed_for_committee: {
    audience: { roles: ["committee"] },
    title: "Revision complete — back for approval",
    body: (label) => `${label} was revised and is back with the committee.`,
    link: (id) => `/committee/applications/${id}`,
  },
  committee_approved_disclose_terms: {
    audience: { roles: ["csa"] },
    title: "Approved — disclose terms to the borrower",
    body: (label) =>
      `${label} was approved by the committee. Disclose the approved terms to the borrower.`,
    link: (id) => `/csa/applications/${id}`,
  },
  committee_denied_call_needed: {
    audience: { roles: ["cig"] },
    title: "Denial call needed",
    body: (label) =>
      `${label} was denied by the committee. Call the borrower to inform them.`,
    link: () => `/cig/denials`,
  },
  committee_revisit_csa: {
    audience: { roles: ["csa"] },
    title: "Committee sent a file back to CSA",
    body: (label, detail) =>
      withDetail(`${label} needs revision before it returns to the committee.`, detail),
    link: (id) => `/csa/applications/${id}`,
  },
  committee_revisit_cig: {
    audience: { roles: ["cig"] },
    title: "Committee sent a file back to CIG",
    body: (label, detail) =>
      withDetail(
        `${label} needs re-verification before it returns to the committee.`,
        detail,
      ),
    link: (id) => `/cig/applications/${id}`,
  },
  terms_disclosed: {
    audience: { borrower: true },
    title: "Approved terms ready for your review",
    body: () =>
      "The approved loan terms are ready. Please review and sign in your portal.",
    link: (id) => `/borrower/applications/${id}`,
  },
  borrower_counter_offer: {
    audience: { roles: ["committee"] },
    title: "Counter-offer received",
    body: (label, detail) =>
      withDetail(`${label}: a counter-offer needs the committee's response.`, detail),
    link: (id) => `/committee/applications/${id}`,
  },
  committee_amount_revised: {
    audience: { borrower: true },
    title: "Loan amount updated",
    body: () =>
      "The committee updated your loan amount. Please review and sign the new terms.",
    link: (id) => `/borrower/applications/${id}`,
  },
  counter_offer_accepted: {
    audience: { borrower: true },
    title: "Counter-offer accepted",
    body: () =>
      "The committee accepted your counter-offer. Your application is moving to release.",
    link: (id) => `/borrower/applications/${id}`,
  },
  negotiation_message_from_borrower: {
    audience: { roles: ["committee"] },
    title: "New message from the borrower",
    body: (label) => `${label}: the borrower posted a negotiation message.`,
    link: (id) => `/committee/applications/${id}`,
  },
  negotiation_message_from_committee: {
    audience: { borrower: true },
    title: "New message about your loan terms",
    body: () => "The committee posted a message on your application.",
    link: (id) => `/borrower/applications/${id}`,
  },
  queued_for_lra: {
    audience: { roles: ["lra"] },
    title: "New file ready for release",
    body: (label) => `${label} was signed and is queued for release processing.`,
    link: (id) => `/lra/applications/${id}`,
  },
  release_awaiting_briefing: {
    audience: { roles: ["collection_head"] },
    title: "Release briefing needed",
    body: (label) =>
      `${label}: all release documents are signed. The borrower briefing is next.`,
    link: () => `/collector/briefings`,
  },
  release_ready_for_release: {
    audience: { roles: ["lra"] },
    title: "Briefing done — ready for release",
    body: (label) =>
      `${label}: the briefing was acknowledged. The file is ready for disbursement.`,
    link: (id) => `/lra/applications/${id}`,
  },
  loan_released: {
    audience: { borrower: true },
    title: "Your loan was released",
    body: () =>
      "Your loan proceeds have been released. Thank you for choosing Loan Star.",
    link: (id) => `/borrower/applications/${id}`,
  },
  release_closed_to_ar: {
    audience: { roles: ["ar"] },
    title: "New account needs a collector",
    body: (label) =>
      `${label} was released and transmitted. The account is active — assign a collector.`,
    link: () => `/ar/masterlist`,
  },
  loan_active: {
    audience: { borrower: true },
    title: "Your loan account is active",
    body: () =>
      "Your loan account is now active. You can view your schedule and payments in the portal.",
    link: (id) => `/borrower/applications/${id}`,
  },
  loan_paid_off: {
    audience: { borrower: true },
    title: "Loan fully paid",
    body: () => "Your loan is fully paid. Thank you!",
    link: (id) => `/borrower/applications/${id}`,
  },
};

/** "AN300459 · Maria Ramos", degrading gracefully when either part is missing. */
export function formatApplicationLabel(
  applicationNo: string | null | undefined,
  borrowerName: string | null | undefined,
): string {
  const parts = [applicationNo, borrowerName].filter(
    (p): p is string => Boolean(p && p.trim()),
  );
  return parts.length ? parts.join(" · ") : "An application";
}
