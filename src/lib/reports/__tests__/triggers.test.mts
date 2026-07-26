import test from "node:test";
import assert from "node:assert/strict";

import { WORKFLOW_TRIGGERS, getTrigger } from "../triggers";

test("workflow defines exactly 16 triggers", () => {
  assert.equal(WORKFLOW_TRIGGERS.length, 16);
});

test("CIG submit is explicit; denial courtesy call tracks phone only", () => {
  const submit = getTrigger("submit_ci_report");
  assert.ok(submit);
  assert.equal(submit!.requiredPermission, "execute_trigger");
  assert.match(submit!.preconditions.join(" ").toLowerCase(), /explicit/);

  const informed = getTrigger("cig_denial_informed");
  assert.ok(informed);
  assert.match(informed!.preconditions.join(" ").toLowerCase(), /phone/);

  const returned = getTrigger("cig_return_to_csa");
  assert.ok(returned);
  assert.match(returned!.preconditions.join(" ").toLowerCase(), /note/);
});

test("each trigger has preconditions and module", () => {
  for (const trigger of WORKFLOW_TRIGGERS) {
    assert.ok(trigger.id.length > 0);
    assert.ok(trigger.module.length > 0);
    assert.ok(trigger.preconditions.length >= 1, `${trigger.id} needs preconditions`);
  }
});

test("endorse_to_cig requires checklist + NCL + signed computation", () => {
  const t = getTrigger("endorse_to_cig");
  assert.ok(t);
  const text = t!.preconditions.join(" ").toLowerCase();
  assert.match(text, /checklist/);
  assert.match(text, /ncl/);
  assert.match(text, /computation/);
});

test("reconcile_post is the only path to Paid per plan", () => {
  const t = getTrigger("reconcile_post");
  assert.ok(t);
  assert.equal(t!.module, "accounting_ar");
});

test("release_disbursement requires borrower briefing sign-off", () => {
  const t = getTrigger("release_disbursement");
  assert.ok(t);
  assert.match(t!.preconditions.join(" ").toLowerCase(), /briefing/);
});
