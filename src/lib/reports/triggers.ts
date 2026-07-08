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
    id: "auto_forward_committee",
    name: "CIG auto-forward to Committee",
    module: "verification",
    requiredPermission: "edit",
    preconditions: [
      "Verification form complete",
      "All required CIG checks recorded",
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
    id: "borrower_sign_release_doc",
    name: "Borrower sign release document",
    module: "borrower_portal",
    requiredPermission: "edit",
    preconditions: [
      "Generated document exists and not finalized",
      "Release file in awaiting_signatures",
    ],
  },
  {
    id: "borrower_sign_briefing",
    name: "Borrower sign briefing",
    module: "borrower_portal",
    requiredPermission: "edit",
    preconditions: [
      "Release file status awaiting_briefing",
      "All release documents signed",
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
    name: "Collector submit DCR",
    module: "collection",
    requiredPermission: "edit",
    preconditions: [
      "DCR in draft status",
      "At least one payment item attached",
    ],
  },
  {
    id: "reconcile_post",
    name: "AR reconcile and post",
    module: "accounting_ar",
    requiredPermission: "execute_trigger",
    preconditions: [
      "DCR status submitted",
      "Bank deposit reference provided",
    ],
  },
  {
    id: "remedial_turnover",
    name: "AR remedial turnover",
    module: "accounting_ar",
    requiredPermission: "execute_trigger",
    preconditions: [
      "Masterlist aging 91+ or remedial_flag",
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
