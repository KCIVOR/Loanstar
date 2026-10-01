import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { describeAuditEvent, TRIGGER_LABELS } from "../labels";

const base = {
  module_slug: "committee",
  action: "update",
  entity_type: "committee_vote",
  entity_id: "x",
  before_data: null,
  after_data: null,
};

// Every trigger present in live audit_events on 2026-10-01.
const LIVE_TRIGGERS = [
  "submit_dcr", "generate_document", "csa_witness_sign_computation",
  "lra_witness_sign_release_doc", "reconcile_dcr_item", "privacy_orientation_given",
  "initial_interview_recorded", "endorse_to_cig", "committee_approve_email",
  "submit_ci_report", "generate_documents", "collector_briefing_ack",
  "release_disbursement", "close_release", "pdc_physical_collect", "ar_receive_file",
  "lra_witness_sign_all_release_docs", "committee_adjust_pre_decision",
  "borrower_sign_computation", "reconcile_post", "mark_paid_off",
  "remove_generated_document", "csa_disclose", "move_of_payment",
  "internal_transfer_posted", "csa_connect_borrower_account", "generate_demand_letter",
  "borrower_counter", "bounce_dcr_item", "generate_final_computation_sheet",
  "committee_deny_email", "remedial_turnover", "generate_acknowledgement_receipt",
  "committee_override", "reject_dcr_item", "clear_hold", "csa_lead_convert",
  "committee_accept_counter_offer", "reject_dcr", "lra_unwitness_sign_release_doc",
  "revision_complete", "move_of_payment_surcharge", "cig_return_to_csa",
  "cig_callback_resolved", "move_of_payment_replacement_check",
  "csa_change_application_owner", "generate_bank_authorization",
  "internal_transfer_rejected", "generate_application_form",
];

describe("describeAuditEvent", () => {
  it("reads a committee approve vote plainly", () => {
    const d = describeAuditEvent({ ...base, after_data: { vote: "approve", comment: null } });
    assert.equal(d.summary, "Voted to APPROVE the loan");
    assert.equal(d.outcome, "approved");
  });

  it("has a label for every live trigger", () => {
    for (const t of LIVE_TRIGGERS) assert.ok(TRIGGER_LABELS[t], `missing label for ${t}`);
  });

  it("falls back for an unknown trigger, never blank", () => {
    const d = describeAuditEvent({
      ...base,
      action: "execute_trigger",
      after_data: { trigger: "brand_new_step" },
    });
    assert.equal(d.summary, "Committee: Brand new step");
  });

  it("marks a failed check as rejected", () => {
    const d = describeAuditEvent({
      ...base,
      module_slug: "verification",
      entity_type: "checks_recorded",
      after_data: { slug: "poea", result: "fail" },
    });
    assert.equal(d.outcome, "rejected");
    assert.match(d.summary, /POEA/);
  });

  it("shows details with plain labels and pesos", () => {
    const d = describeAuditEvent({
      ...base,
      module_slug: "accounting_ar",
      entity_type: "dcr",
      action: "execute_trigger",
      after_data: { trigger: "reconcile_post", status: "reconciled", depositAmount: 65841.92 },
    });
    assert.equal(d.details.find((x) => x.label === "Deposit amount")?.after, "₱65,841.92");
    assert.equal(d.details.find((x) => x.label === "Status")?.after, "Reconciled");
  });

  it("shows before and after status", () => {
    const d = describeAuditEvent({
      ...base,
      module_slug: "collection",
      entity_type: "payment",
      before_data: { status: "pending_verification" },
      after_data: { trigger: "payment_proof_rejected", status: "rejected", reason: "Blurry" },
    });
    assert.equal(d.summary, "Rejected the borrower's payment proof");
    assert.deepEqual(d.details.find((x) => x.label === "Status"), {
      label: "Status",
      before: "Pending verification",
      after: "Rejected",
    });
    assert.equal(d.details.find((x) => x.label === "Reason")?.after, "Blurry");
  });

  it("hides ids and nested objects from details", () => {
    const d = describeAuditEvent({
      ...base,
      after_data: { applicationId: "abc", borrowerId: "def", borrower: { gender: "f" } },
    });
    assert.equal(d.details.length, 0);
  });

  it("reads sign-in events", () => {
    assert.equal(
      describeAuditEvent({ ...base, module_slug: "auth_admin", action: "login", entity_type: "user" }).summary,
      "Signed in",
    );
    assert.equal(
      describeAuditEvent({
        ...base,
        action: "login_failed",
        entity_type: null,
        after_data: { email: "a@b.com" },
      }).summary,
      "Failed sign-in attempt for a@b.com",
    );
  });
});
