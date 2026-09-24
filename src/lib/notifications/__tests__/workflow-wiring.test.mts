import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel: string) => readFileSync(root + rel, "utf8");

/** [file, key, marker that must appear BEFORE the notification]. */
const WIRING: Array<[string, string, string]> = [
  ["app/api/borrower/applications/[id]/submit/route.ts", "application_submitted_by_borrower", "appendStatusHistory("],
  ["app/api/borrower/applications/[id]/computation/route.ts", "computation_signed_by_borrower", "writeAuditEvent("],
  ["app/api/borrower/applications/[id]/documents/route.ts", "document_uploaded_by_borrower", "writeAuditEvent("],
  ["app/api/documents/[id]/request-revision/route.ts", "document_revision_requested", "recordApplicationHold("],
  ["app/api/csa/applications/[id]/endorse/route.ts", "application_endorsed_to_cig", "appendStatusHistory("],
  ["lib/cig/receipt.ts", "application_returned_to_csa", "appendStatusHistory("],
  ["lib/cig/cancel.ts", "application_cancelled_staff", "appendStatusHistory("],
  ["lib/cig/cancel.ts", "application_cancelled_borrower", "appendStatusHistory("],
  ["lib/cig/forward.ts", "application_forwarded_to_committee", "appendStatusHistory("],
  ["lib/committee/actions.ts", "committee_approved_disclose_terms", "writeAuditEvent("],
  ["lib/committee/actions.ts", "committee_denied_call_needed", "writeAuditEvent("],
  ["lib/committee/actions.ts", "committee_revisit_cig", "writeAuditEvent("],
  ["lib/committee/actions.ts", "committee_revisit_csa", "writeAuditEvent("],
  ["lib/negotiation/service.ts", "terms_disclosed", "appendStatusHistory("],
  ["lib/negotiation/service.ts", "borrower_counter_offer", "appendStatusHistory("],
  ["lib/negotiation/service.ts", "committee_amount_revised", "logOfferMessage("],
  ["lib/negotiation/service.ts", "counter_offer_accepted", "queueForLra("],
  ["lib/negotiation/service.ts", "negotiation_message_from_borrower", ".insert("],
  ["lib/negotiation/service.ts", "negotiation_message_from_committee", ".insert("],
  ["lib/negotiation/service.ts", "queued_for_lra", "appendStatusHistory("],
  ["lib/negotiation/service.ts", "revision_completed_for_committee", "appendStatusHistory("],
  ["lib/lra/release-service.ts", "release_awaiting_briefing", "syncApplicationBlocker("],
  ["lib/lra/release-service.ts", "release_ready_for_release", "syncApplicationBlocker("],
  ["lib/lra/release-service.ts", "loan_released", "syncApplicationBlocker("],
  ["lib/ar/masterlist.ts", "loan_active", "appendStatusHistory("],
  ["lib/ar/masterlist.ts", "release_closed_to_ar", "appendStatusHistory("],
  ["lib/ar/masterlist.ts", "loan_paid_off", "appendStatusHistory("],
];

for (const [file, key, marker] of WIRING) {
  test(`${file} dispatches ${key} after the state change`, () => {
    const text = read(file);
    const at = text.indexOf(`"${key}"`);
    assert.ok(at > -1, `${key} not dispatched in ${file}`);
    assert.ok(
      text.slice(0, at).includes(marker),
      `${key} fires before ${marker} in ${file}`,
    );
  });
}

test("assignments notify the new collector / remedial officer", () => {
  const text = read("lib/ar/masterlist.ts");
  assert.match(text, /account_assigned_collector/);
  assert.match(text, /account_turned_over_remedial/);
  assert.match(text, /account_removed_from_collector/);
});

test("DCR submit notifies AR and reconcile notifies the owner", () => {
  assert.match(read("app/api/collector/dcr/route.ts"), /dcr_submitted/);
  assert.match(read("app/api/ar/dcr/[id]/reconcile/route.ts"), /notifyDcrOwner/);
  assert.match(
    read("app/api/ar/dcr/items/[itemId]/reconcile/route.ts"),
    /notifyDcrOwner/,
  );
});

test("dispatcher is best-effort and never role-broadcasts by accident", () => {
  const text = read("lib/notifications/workflow-events.ts");
  assert.match(text, /catch\s*\{/);
  assert.doesNotMatch(text, /is_super_admin/);
});
