/** All 15 LoanStar module slugs, matching seeded `modules` table rows. */
export const MODULE_SLUGS = [
  "auth_admin",
  "borrower_portal",
  "leads",
  "intake",
  "computation",
  "verification",
  "committee",
  "negotiation",
  "release_lra",
  "accounting_ar",
  "collection",
  "remedial",
  "reports",
  "system_config",
  "audit_log",
] as const;

export type ModuleSlug = (typeof MODULE_SLUGS)[number];

export type ModuleDefinition = {
  slug: ModuleSlug;
  name: string;
  description: string;
  sortOrder: number;
};

/** All 15 LoanStar modules with display metadata. */
export const MODULES: readonly ModuleDefinition[] = [
  {
    slug: "auth_admin",
    name: "Auth & Admin",
    description: "User and role management",
    sortOrder: 1,
  },
  {
    slug: "borrower_portal",
    name: "Borrower Portal",
    description: "Borrower self-service",
    sortOrder: 2,
  },
  {
    slug: "leads",
    name: "Leads",
    description: "Agent lead management",
    sortOrder: 3,
  },
  {
    slug: "intake",
    name: "Intake",
    description: "CSA application intake",
    sortOrder: 4,
  },
  {
    slug: "computation",
    name: "Computation",
    description: "Loan computation engine",
    sortOrder: 5,
  },
  {
    slug: "verification",
    name: "Verification",
    description: "CIG verification",
    sortOrder: 6,
  },
  {
    slug: "committee",
    name: "Committee",
    description: "Committee decisions",
    sortOrder: 7,
  },
  {
    slug: "negotiation",
    name: "Negotiation",
    description: "Term negotiation",
    sortOrder: 8,
  },
  {
    slug: "release_lra",
    name: "Release (LRA)",
    description: "LRA documentation and release",
    sortOrder: 9,
  },
  {
    slug: "accounting_ar",
    name: "Accounting (AR)",
    description: "AR posting and masterlist",
    sortOrder: 10,
  },
  {
    slug: "collection",
    name: "Collection",
    description: "Collector workspace",
    sortOrder: 11,
  },
  {
    slug: "remedial",
    name: "Remedial",
    description: "Remedial / paralegal",
    sortOrder: 12,
  },
  {
    slug: "reports",
    name: "Reports",
    description: "Management reports",
    sortOrder: 13,
  },
  {
    slug: "system_config",
    name: "System Config",
    description: "System configuration",
    sortOrder: 14,
  },
  {
    slug: "audit_log",
    name: "Audit Log",
    description: "Audit event log",
    sortOrder: 15,
  },
] as const;

/** Application status values for the borrower timeline (End-to-End workflow). */
export const APPLICATION_STATUSES = [
  "registered",
  "documents_pending",
  "submitted",
  "for_verification",
  "for_approval",
  "approved",
  "denied",
  "negotiating_terms",
  "awaiting_confirmation",
  "on_hold",
  "for_revision",
  "lra_pending",
  "release_signing",
  "release_briefing",
  "release_ready",
  "released",
  "closed",
  "loan_active",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const DOCUMENT_BUCKET = "loan-documents";

/** Document checklist stages across the loan lifecycle. */
export const STAGES = [
  "intake",
  "cig_endorsement",
  "accounting",
  "signing_with_pdc",
  "signing_without_pdc",
  "release",
] as const;

export type Stage = (typeof STAGES)[number];
