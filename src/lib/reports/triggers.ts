/**
 * Workflow trigger registry — preconditions documented for QA gate tests.
 * Each trigger MUST write an audit event when fired (P1 standing rule).
 */
export type WorkflowTrigger = {
  id: string;
  name: string;
  module: string;
  requiredPermission: "execute_trigger" | "edit" | "create";
  preconditions: string[];
};

export const WORKFLOW_TRIGGERS: WorkflowTrigger[] = [
  {
    id: "endorse_to_cig",
    name: "Endorse to CIG",
    module: "intake",
    requiredPermission: "execute_trigger",
    preconditions: [
      "All intake checklist items confirmed",
      "NCL check recorded",
      "Signed computation present",
      "Application status allows endorsement",
    ],
  },
  {
    id: "submit_ci_report",
    name: "CIG submit CI report to Committee",
    module: "verification",
    requiredPermission: "execute_trigger",
    preconditions: [
      "Verification form complete (incl. borrower interview)",
      "All required CIG checks recorded",
      "Finding (positive/negative) set",
      "Explicit submit click",
    ],
  },
  {
    id: "cig_return_to_csa",
    name: "CIG return file to CSA",
    module: "verification",
    requiredPermission: "execute_trigger",
    preconditions: [
      "Application status for_verification",
      "Receipt check found the file incomplete",
      "Note for CSA provided",
    ],
  },
  {
    id: "cig_denial_informed",
    name: "CIG borrower denial call done",
    module: "verification",
    requiredPermission: "edit",
    preconditions: [
      "Open denial notice exists",
      "Borrower informed by phone (reason withheld)",
      "Written denial email already sent on committee Deny",
    ],
  },
  {
    id: "committee_final_action",
    name: "Committee final action",
    module: "committee",
    requiredPermission: "execute_trigger",
    preconditions: [
      "Application in for_approval or committee review",
      "Explicit final-action click (approve/deny/revisit/hold)",
    ],
  },
  {
    id: "borrower_sign_computation",
    name: "Borrower sign computation",
    module: "borrower_portal",
    requiredPermission: "edit",
    preconditions: [
      "Active computation exists",
      "Borrower owns application",
      "Negotiation awaiting signature if applicable",
    ],
  },
  {
    id: "lra_witness_sign_release_doc",
    name: "LRA witness release document signing",
    module: "release_lra",
    requiredPermission: "edit",
    preconditions: [
      "Generated document exists and not finalized",
      "Release file in awaiting_signatures",
      "Borrower signed the document in-branch",
    ],
  },
  {
    id: "collector_briefing_ack",
    name: "Briefer briefing check-off",
    module: "collection",
    requiredPermission: "execute_trigger",
    preconditions: [
      "Release file status awaiting_briefing",
      "All release documents signed",
      "Briefing conducted with the borrower",
    ],
  },
  {
    id: "release_disbursement",
    name: "LRA record release",
    module: "release_lra",
    requiredPermission: "execute_trigger",
    preconditions: [
      "Release file status ready_release",
      "Briefing acknowledged by borrower",
    ],
  },
  {
    id: "close_release",
    name: "LRA close and transmit",
    module: "release_lra",
    requiredPermission: "execute_trigger",
    preconditions: [
      "Release status released",
      "Signed check voucher uploaded on release checklist",
    ],
  },
  {
    id: "submit_dcr",
    name: "Collector submit DCRR",
    module: "collection",
    requiredPermission: "edit",
    preconditions: [
      "DCRR in draft status",
      "At least one payment item attached",
    ],
  },
  {
    id: "ar_receive_file",
    name: "AR receive closed file",
    module: "accounting_ar",
    requiredPermission: "execute_trigger",
    preconditions: [
      "Application in AR queue (LRA closed the file)",
      "Not yet received (no masterlist account)",
    ],
  },
  {
    id: "reconcile_post",
    name: "AR reconcile and post",
    module: "accounting_ar",
    requiredPermission: "execute_trigger",
    preconditions: [
      "DCRR status submitted",
      "Bank deposit reference provided",
      "Deposit amount equals DCRR total",
    ],
  },
  {
    id: "mark_paid_off",
    name: "AR mark loan paid off",
    module: "accounting_ar",
    requiredPermission: "execute_trigger",
    preconditions: [
      "Application status loan_active",
      "Outstanding balance zero",
      "All installments paid",
    ],
  },
  {
    id: "remedial_turnover",
    name: "AR remedial turnover",
    module: "accounting_ar",
    requiredPermission: "execute_trigger",
    preconditions: [
      "Masterlist aging at 90-day threshold or remedial_flag",
      "Remedial user assigned",
    ],
  },
  {
    id: "csa_disclose",
    name: "CSA disclose approved terms",
    module: "negotiation",
    requiredPermission: "execute_trigger",
    preconditions: ["Application status approved"],
  },
];

export function getTrigger(id: string): WorkflowTrigger | undefined {
  return WORKFLOW_TRIGGERS.find((t) => t.id === id);
}
