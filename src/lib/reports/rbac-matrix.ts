/**
 * Expected default RBAC matrix from P1 seed (20260706100002_p1_seed_data.sql).
 * Used by QA tests to verify permission configuration integrity.
 */
export type ExpectedPermission = {
  role: string;
  module: string;
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  executeTrigger: boolean;
};

export const EXPECTED_DEFAULT_RBAC: ExpectedPermission[] = [
  { role: "borrower", module: "borrower_portal", view: true, create: true, edit: true, delete: false, executeTrigger: false },
  { role: "agent", module: "leads", view: true, create: true, edit: true, delete: false, executeTrigger: false },
  { role: "csa", module: "intake", view: true, create: true, edit: true, delete: false, executeTrigger: true },
  { role: "csa", module: "computation", view: true, create: true, edit: true, delete: false, executeTrigger: true },
  { role: "csa", module: "negotiation", view: true, create: true, edit: true, delete: false, executeTrigger: true },
  { role: "cig", module: "verification", view: true, create: true, edit: true, delete: false, executeTrigger: true },
  { role: "cig", module: "intake", view: true, create: false, edit: true, delete: false, executeTrigger: false },
  { role: "cig", module: "computation", view: true, create: false, edit: false, delete: false, executeTrigger: false },
  { role: "committee", module: "committee", view: true, create: true, edit: true, delete: false, executeTrigger: true },
  { role: "committee", module: "negotiation", view: true, create: true, edit: true, delete: false, executeTrigger: true },
  { role: "lra", module: "release_lra", view: true, create: true, edit: true, delete: false, executeTrigger: true },
  { role: "ar", module: "accounting_ar", view: true, create: true, edit: true, delete: false, executeTrigger: true },
  { role: "ar", module: "reports", view: true, create: false, edit: false, delete: false, executeTrigger: false },
  { role: "collector", module: "collection", view: true, create: true, edit: true, delete: false, executeTrigger: true },
  { role: "remedial", module: "remedial", view: true, create: true, edit: true, delete: false, executeTrigger: true },
];

/** Roles that must NOT have view on modules (confidentiality boundaries). */
export const CONFIDENTIALITY_DENY: Array<{ role: string; module: string; reason: string }> = [
  { role: "agent", module: "intake", reason: "Agent sees checklist flags only, not full intake" },
  { role: "borrower", module: "committee", reason: "Borrower never sees votes or comments" },
  { role: "borrower", module: "verification", reason: "Verification notes confidential" },
  { role: "csa", module: "release_lra", reason: "CSA cannot view finalized release docs" },
  { role: "committee", module: "release_lra", reason: "Committee cannot view finalized release docs" },
  { role: "collector", module: "accounting_ar", reason: "Collectors see assigned accounts only via RLS" },
];
