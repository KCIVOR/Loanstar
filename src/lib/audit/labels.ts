/**
 * Plain-language catalog for the Activity Log (Super Admin → Audit Log).
 *
 * Stored `action` / `module_slug` / `entity_type` / `after_data.trigger`
 * values are frozen — rate limiting, committee decision-email status and the
 * dashboard widget read them — so readability is produced here, at read time.
 * This also makes historic rows readable without touching the append-only table.
 */
import { MODULES } from "@/lib/constants";

export type AuditOutcome =
  | "approved"
  | "rejected"
  | "returned"
  | "cancelled"
  | "completed"
  | "changed"
  | "created"
  | "deleted"
  | "viewed"
  | "signed_in"
  | "signed_out";

export type AuditRowInput = {
  module_slug: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
};

export type AuditDetail = {
  label: string;
  before: string | null;
  after: string | null;
};

export type AuditDescription = {
  summary: string;
  outcome: AuditOutcome | null;
  details: AuditDetail[];
};

type Label = { summary: string; outcome: AuditOutcome };

/** One entry per workflow step recorded in `after_data.trigger`. */
export const TRIGGER_LABELS: Record<string, Label> = {
  // Intake / CSA
  privacy_orientation_given: { summary: "Recorded the privacy orientation", outcome: "completed" },
  initial_interview_recorded: { summary: "Recorded the initial interview", outcome: "completed" },
  endorse_to_cig: { summary: "Endorsed the application to CIG for verification", outcome: "completed" },
  csa_disclose: { summary: "Disclosed the loan terms to the borrower", outcome: "completed" },
  csa_witness_sign_computation: { summary: "Witnessed the borrower signing the loan computation", outcome: "completed" },
  csa_connect_borrower_account: { summary: "Connected the borrower's online account to the application", outcome: "changed" },
  csa_lead_convert: { summary: "Converted a lead into a loan application", outcome: "created" },
  csa_change_application_owner: { summary: "Changed the borrower on the application", outcome: "changed" },
  clear_hold: { summary: "Cleared the hold on the application", outcome: "changed" },
  revision_complete: { summary: "Marked the requested revision as complete", outcome: "completed" },
  generate_application_form: { summary: "Generated the application form", outcome: "created" },
  generate_bank_authorization: { summary: "Generated the bank authorization", outcome: "created" },
  // CIG / verification
  submit_ci_report: { summary: "Submitted the CI report to Committee", outcome: "completed" },
  cig_return_to_csa: { summary: "Returned the application to CSA for revision", outcome: "returned" },
  cig_callback_resolved: { summary: "Resolved the verification callback", outcome: "completed" },
  // Committee / negotiation
  committee_approve_email: { summary: "Sent the loan approval notice to the borrower", outcome: "approved" },
  committee_deny_email: { summary: "Sent the loan denial notice to the borrower", outcome: "rejected" },
  committee_override: { summary: "Overrode the committee decision", outcome: "changed" },
  committee_adjust_pre_decision: { summary: "Adjusted the loan terms before deciding", outcome: "changed" },
  committee_accept_counter_offer: { summary: "Accepted the borrower's counter-offer", outcome: "approved" },
  borrower_counter: { summary: "Borrower sent a counter-offer", outcome: "changed" },
  borrower_sign_computation: { summary: "Borrower signed the loan computation", outcome: "completed" },
  // Release (LRA)
  generate_document: { summary: "Generated a release document", outcome: "created" },
  generate_documents: { summary: "Generated the release documents", outcome: "created" },
  remove_generated_document: { summary: "Removed a generated release document", outcome: "deleted" },
  lra_witness_sign_release_doc: { summary: "Witnessed the signing of a release document", outcome: "completed" },
  lra_witness_sign_all_release_docs: { summary: "Witnessed the signing of all release documents", outcome: "completed" },
  lra_unwitness_sign_release_doc: { summary: "Undid the signature on a release document", outcome: "returned" },
  pdc_physical_collect: { summary: "Collected the post-dated checks", outcome: "completed" },
  release_disbursement: { summary: "Released the loan proceeds", outcome: "completed" },
  close_release: { summary: "Closed the release file", outcome: "completed" },
  generate_final_computation_sheet: { summary: "Generated the final computation sheet", outcome: "created" },
  generate_acknowledgement_receipt: { summary: "Generated the acknowledgement receipt", outcome: "created" },
  // Accounting (AR)
  ar_receive_file: { summary: "Received the loan file in Accounting", outcome: "completed" },
  reconcile_post: { summary: "Reconciled and posted the daily collection report", outcome: "approved" },
  reconcile_dcr_item: { summary: "Reconciled a collection report line", outcome: "approved" },
  reject_dcr: { summary: "Rejected the daily collection report", outcome: "rejected" },
  reject_dcr_item: { summary: "Rejected a collection report line", outcome: "rejected" },
  bounce_dcr_item: { summary: "Marked a check as bounced", outcome: "rejected" },
  internal_transfer_posted: { summary: "Confirmed a loan offset / internal transfer", outcome: "approved" },
  internal_transfer_rejected: { summary: "Rejected a loan offset / internal transfer", outcome: "rejected" },
  mark_paid_off: { summary: "Marked the loan as fully paid", outcome: "completed" },
  masterlist_export: { summary: "Downloaded the loan masterlist", outcome: "viewed" },
  // Collection / remedial
  submit_dcr: { summary: "Submitted the daily collection report", outcome: "completed" },
  collector_briefing_ack: { summary: "Acknowledged the collector briefing", outcome: "completed" },
  move_of_payment: { summary: "Moved the borrower's payment schedule", outcome: "changed" },
  move_of_payment_surcharge: { summary: "Recorded the move-of-payment surcharge", outcome: "changed" },
  move_of_payment_replacement_check: { summary: "Recorded a replacement check", outcome: "created" },
  generate_demand_letter: { summary: "Generated a demand letter", outcome: "created" },
  remedial_turnover: { summary: "Turned the account over to Remedial", outcome: "changed" },
  payment_proof_confirmed: { summary: "Confirmed the borrower's payment proof", outcome: "approved" },
  payment_proof_rejected: { summary: "Rejected the borrower's payment proof", outcome: "rejected" },
  send_payment_reminder: { summary: "Sent payment reminders to borrowers", outcome: "completed" },
  // Admin
  legacy_import_run: { summary: "Ran a legacy data import", outcome: "created" },
  audit_log_export: { summary: "Downloaded the activity log", outcome: "viewed" },
};

/** Words for entity types, used by generic sentences. */
const ENTITY_WORDS: Record<string, string> = {
  loan_application: "the loan application",
  application: "the loan application",
  document: "a document",
  release_file: "the release file",
  computation: "the loan computation",
  verification: "the verification report",
  masterlist: "the loan account",
  checks_recorded: "a background check",
  dcr: "the daily collection report",
  dcr_item: "a collection report line",
  generated_document: "a release document",
  rendered_document: "a document",
  payment: "a payment",
  committee_vote: "a committee vote",
  committee_action: "the committee decision",
  committee_assessment: "the committee assessment",
  borrower: "the borrower's details",
  user: "a user account",
  profile: "their profile",
  pdc_checks: "the post-dated checks",
  pdc_check: "a post-dated check",
  briefing: "the collector briefing",
  document_template: "a document template",
  document_template_version: "a document template draft",
  config_settings: "the system settings",
  role: "a role",
  role_module_permissions: "role permissions",
  role_field_rules: "role field rules",
  stage_checklist: "a stage checklist",
  lead: "a lead",
  negotiation: "the loan negotiation",
  negotiation_message: "a negotiation message",
  internal_transfer: "an internal transfer",
  callback: "a verification callback",
  file_hold: "a hold on the file",
  application_cancellation: "the application",
  rounding_writeoff: "a rounding difference",
  legacy_import_run: "a legacy import",
  legacy_import_mapping: "an import field mapping",
  reports_assistant: "the Reports assistant",
  reports_insight_brief: "a reports insight brief",
  email: "an email",
};

/** Mirrors `check_types.name` (live 2026-10-01); unknown slugs are humanized. */
const CHECK_NAMES: Record<string, string> = {
  ncl: "NCL",
  nfis: "NFIS",
  mf: "Masterfile",
  lslg_denied_cancelled: "LSLG Denied/Cancelled",
  poea: "POEA",
  marina: "Marina",
  sme_duplication: "SME Duplication",
};

const ACTION_VERBS: Record<string, { verb: string; outcome: AuditOutcome }> = {
  create: { verb: "Created", outcome: "created" },
  update: { verb: "Updated", outcome: "changed" },
  edit: { verb: "Edited", outcome: "changed" },
  delete: { verb: "Deleted", outcome: "deleted" },
  generate: { verb: "Generated", outcome: "created" },
  export: { verb: "Downloaded", outcome: "viewed" },
  execute_trigger: { verb: "Completed a step on", outcome: "completed" },
};

const AREA_EXTRA: Record<string, string> = { auth: "Sign-in" };

export function areaLabel(slug: string): string {
  return (
    MODULES.find((m) => m.slug === slug)?.name ??
    AREA_EXTRA[slug] ??
    humanize(slug)
  );
}

/** "brand_new_step" → "Brand new step". */
export function humanize(value: string): string {
  const spaced = value.replace(/[_.-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim().toLowerCase();
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : value;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

function describeCore(row: AuditRowInput): Label {
  const after = row.after_data ?? {};
  const trigger = str(after.trigger);
  const entity = row.entity_type ?? "";

  if (row.action === "login") return { summary: "Signed in", outcome: "signed_in" };
  if (row.action === "logout") return { summary: "Signed out", outcome: "signed_out" };
  if (row.action === "login_failed") {
    const email = str(after.email);
    return {
      summary: email ? `Failed sign-in attempt for ${email}` : "Failed sign-in attempt",
      outcome: "rejected",
    };
  }

  if (trigger && TRIGGER_LABELS[trigger]) return TRIGGER_LABELS[trigger];

  if (entity === "committee_vote" && str(after.vote)) {
    const vote = str(after.vote)!;
    return {
      summary: `Voted to ${vote.toUpperCase()} the loan`,
      outcome: vote === "approve" ? "approved" : vote === "deny" ? "rejected" : "changed",
    };
  }
  if (entity === "committee_action") {
    const label = str((after.tally as Record<string, unknown> | undefined)?.label);
    return { summary: label ? `Recorded the committee decision (${label})` : "Recorded the committee decision", outcome: "completed" };
  }
  if (entity === "checks_recorded") {
    const slug = str(after.slug) ?? "";
    const name = CHECK_NAMES[slug] ?? (slug ? humanize(slug) : "background");
    const result = str(after.result);
    if (result === "pass") return { summary: `Recorded the ${name} check: Passed`, outcome: "approved" };
    if (result === "fail") return { summary: `Recorded the ${name} check: Failed`, outcome: "rejected" };
    return { summary: `Recorded the ${name} check`, outcome: "changed" };
  }
  if (entity === "verification" && str(after.finding)) {
    return { summary: `Recorded the verification finding: ${humanize(str(after.finding)!)}`, outcome: "changed" };
  }
  if (entity === "dev_simulate_aging") return { summary: "Simulated account aging (testing tool)", outcome: "changed" };
  if (entity === "callback" && !trigger) return { summary: "Logged a verification callback", outcome: "created" };
  if (entity === "payment" && row.action === "create") return { summary: "Recorded a borrower payment", outcome: "created" };
  if (entity === "application_cancellation") return { summary: "Cancelled the application", outcome: "cancelled" };
  if (entity === "file_hold") return { summary: "Put the application on hold", outcome: "changed" };
  if (entity === "document") {
    const file = str(after.fileName) ?? str(after.file_name);
    if (str(after.status) === "confirmed") return { summary: file ? `Confirmed the document "${file}"` : "Confirmed a document", outcome: "approved" };
    if (str(after.status) === "revision_requested") return { summary: file ? `Asked for a new copy of "${file}"` : "Asked for a new copy of a document", outcome: "returned" };
    if (row.action === "update" || row.action === "create") return { summary: file ? `Uploaded "${file}"` : "Uploaded a document", outcome: "created" };
  }
  if (row.action === "case_file.view") return { summary: "Viewed the account case file", outcome: "viewed" };
  if (row.action === "ask") return { summary: "Asked the Reports assistant a question", outcome: "viewed" };
  if (row.action === "avatar_upload") return { summary: "Changed their profile photo", outcome: "changed" };
  if (entity === "user") {
    if (row.action === "create") return { summary: "Created a user account", outcome: "created" };
    if (after.is_active === false || after.isActive === false) return { summary: "Deactivated a user account", outcome: "deleted" };
    if (row.action === "delete") return { summary: "Deactivated a user account", outcome: "deleted" };
  }

  if (trigger) {
    return { summary: `${areaLabel(row.module_slug)}: ${humanize(trigger)}`, outcome: "completed" };
  }

  const verb = ACTION_VERBS[row.action];
  const words = ENTITY_WORDS[entity] ?? (entity ? humanize(entity).toLowerCase() : null);
  if (verb && words) return { summary: `${verb.verb} ${words}`, outcome: verb.outcome };
  if (verb) return { summary: `${areaLabel(row.module_slug)}: ${verb.verb}`, outcome: verb.outcome };
  return { summary: `${areaLabel(row.module_slug)}: ${humanize(row.action)}`, outcome: "changed" };
}

/* ---------- detail rows (Before → After) ---------- */

type FieldKind = "text" | "money" | "date" | "status" | "bool" | "count";

const FIELD_LABELS: Record<string, { label: string; kind: FieldKind }> = {
  status: { label: "Status", kind: "status" },
  reason: { label: "Reason", kind: "text" },
  note: { label: "Note", kind: "text" },
  notes: { label: "Notes", kind: "text" },
  comment: { label: "Remarks", kind: "text" },
  remarks: { label: "Remarks", kind: "text" },
  vote: { label: "Vote", kind: "status" },
  result: { label: "Result", kind: "status" },
  finding: { label: "Finding", kind: "status" },
  slug: { label: "Item", kind: "status" },
  amount: { label: "Amount", kind: "money" },
  depositAmount: { label: "Deposit amount", kind: "money" },
  netReleased: { label: "Net amount released", kind: "money" },
  surchargeAmount: { label: "Surcharge", kind: "money" },
  newBalance: { label: "New balance", kind: "money" },
  outstandingBalance: { label: "Outstanding balance", kind: "money" },
  depositReference: { label: "Deposit reference", kind: "text" },
  referenceNo: { label: "Reference no.", kind: "text" },
  channel: { label: "Payment channel", kind: "status" },
  fileName: { label: "File", kind: "text" },
  file_name: { label: "File", kind: "text" },
  checkNumber: { label: "Check no.", kind: "text" },
  checkDate: { label: "Check date", kind: "date" },
  paymentDate: { label: "Payment date", kind: "date" },
  deadlineDate: { label: "Deadline", kind: "date" },
  extensionDueDate: { label: "New due date", kind: "date" },
  signedAt: { label: "Signed at", kind: "date" },
  submittedAt: { label: "Submitted at", kind: "date" },
  writtenOffAt: { label: "Written off at", kind: "date" },
  email: { label: "Email", kind: "text" },
  stage: { label: "Stage", kind: "status" },
  segment: { label: "Loan segment", kind: "status" },
  demandStage: { label: "Demand stage", kind: "status" },
  agingBucket: { label: "Aging bucket", kind: "text" },
  emailSent: { label: "Email sent", kind: "bool" },
  allSigned: { label: "All documents signed", kind: "bool" },
  count: { label: "Count", kind: "count" },
  rowCount: { label: "Rows", kind: "count" },
  sent: { label: "Sent", kind: "count" },
  skipped: { label: "Skipped", kind: "count" },
  terms: { label: "Terms", kind: "count" },
  accounts: { label: "Accounts", kind: "count" },
  validRows: { label: "Valid rows", kind: "count" },
  warningRows: { label: "Rows with warnings", kind: "count" },
  errorRows: { label: "Rows with errors", kind: "count" },
  name: { label: "Name", kind: "text" },
  full_name: { label: "Name", kind: "text" },
  fullName: { label: "Name", kind: "text" },
  is_active: { label: "Active", kind: "bool" },
  isActive: { label: "Active", kind: "bool" },
};

const pesoFmt = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatAuditDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatValue(value: unknown, kind: FieldKind): string | null {
  if (value === null || value === undefined || value === "") return null;
  switch (kind) {
    case "money": {
      const n = typeof value === "number" ? value : Number(value);
      return Number.isFinite(n) ? pesoFmt.format(n).replace("PHP", "₱").replace(/\s/g, "") : String(value);
    }
    case "date":
      return typeof value === "string" ? formatAuditDate(value) : String(value);
    case "status":
      return typeof value === "string"
        ? CHECK_NAMES[value] ?? humanize(value)
        : String(value);
    case "bool":
      return value === true ? "Yes" : value === false ? "No" : String(value);
    case "count":
      return String(value);
    default:
      return typeof value === "string" ? value : JSON.stringify(value);
  }
}

function buildDetails(row: AuditRowInput): AuditDetail[] {
  const before = row.before_data ?? {};
  const after = row.after_data ?? {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: AuditDetail[] = [];
  const seen = new Set<string>();
  for (const key of Object.keys(FIELD_LABELS)) {
    if (!keys.has(key)) continue;
    const { label, kind } = FIELD_LABELS[key];
    if (seen.has(label)) continue;
    const b = formatValue(before[key], kind);
    const a = formatValue(after[key], kind);
    if (b === null && a === null) continue;
    seen.add(label);
    out.push({ label, before: b, after: a });
  }
  return out;
}

export function describeAuditEvent(row: AuditRowInput): AuditDescription {
  const core = describeCore(row);
  return { summary: core.summary, outcome: core.outcome, details: buildDetails(row) };
}

/* ---------- filter groups ---------- */

export const AUDIT_KINDS = ["all", "decision", "money", "document", "access", "settings"] as const;
export type AuditKind = (typeof AUDIT_KINDS)[number];

export const AUDIT_KIND_LABELS: Record<AuditKind, string> = {
  all: "All activity",
  decision: "Decisions",
  money: "Money & payments",
  document: "Documents",
  access: "Sign-ins & downloads",
  settings: "Settings & users",
};

/**
 * PostgREST `or` filter per kind (applied server-side). Values are fixed
 * strings — never built from user input.
 */
export const AUDIT_KIND_FILTERS: Record<Exclude<AuditKind, "all">, string> = {
  decision:
    "module_slug.in.(committee,verification,negotiation),entity_type.in.(application_cancellation,file_hold,checks_recorded)",
  money:
    "module_slug.in.(accounting_ar),entity_type.in.(payment,dcr,dcr_item,internal_transfer,pdc_check,pdc_checks,rounding_writeoff)",
  document:
    "entity_type.in.(document,generated_document,rendered_document,document_template,document_template_version)",
  access: "action.in.(login,logout,login_failed,export,case_file.view)",
  settings:
    "module_slug.in.(system_config,auth_admin,account_settings),entity_type.in.(user,role,role_module_permissions,role_field_rules,config_settings)",
};
