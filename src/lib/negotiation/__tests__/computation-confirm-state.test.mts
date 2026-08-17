import test from "node:test";
import assert from "node:assert/strict";

import { computationConfirmState } from "../computation-confirm-state";

test("waiting for CSA disclosure after approval", () => {
  assert.equal(
    computationConfirmState({
      signedAt: null,
      negotiationStatus: "pending_disclosure",
      applicationStatus: "approved",
    }),
    "waiting_disclosure",
  );
  assert.equal(
    computationConfirmState({
      signedAt: "2026-07-10T06:21:03.004Z",
      negotiationStatus: null,
      applicationStatus: "approved",
    }),
    "waiting_disclosure",
  );
});

test("intake signature does not count once terms await post-disclosure confirm", () => {
  assert.equal(
    computationConfirmState({
      signedAt: "2026-07-10T06:21:03.004Z",
      negotiationStatus: "awaiting_signature",
      applicationStatus: "awaiting_confirmation",
    }),
    "confirm",
  );
});

test("unsigned computation can be confirmed after disclosure", () => {
  assert.equal(
    computationConfirmState({
      signedAt: null,
      negotiationStatus: "awaiting_signature",
      applicationStatus: "awaiting_confirmation",
    }),
    "confirm",
  );
});

test("intake-only signature (no negotiation) shows as confirmed", () => {
  assert.equal(
    computationConfirmState({
      signedAt: "2026-07-10T06:21:03.004Z",
      negotiationStatus: null,
      applicationStatus: "submitted",
    }),
    "confirmed",
  );
});

test("pre-decision computation (no negotiation, no signature) is not confirmable", () => {
  assert.equal(
    computationConfirmState({
      signedAt: null,
      negotiationStatus: null,
      applicationStatus: "for_approval",
    }),
    "hidden",
  );
});

test("post-sign negotiation status hides confirm button", () => {
  assert.equal(
    computationConfirmState({
      signedAt: "2026-07-10T08:00:00.000Z",
      negotiationStatus: "signed",
      applicationStatus: "lra_pending",
    }),
    "confirmed",
  );
});
