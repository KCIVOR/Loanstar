import test from "node:test";
import assert from "node:assert/strict";

import { canStartReloan, findResumableDraft, nextApplicationKind } from "../reloan";

test("canStartReloan allows when borrower has only paid_off apps", () => {
  assert.deepEqual(
    canStartReloan({ applicationStatuses: ["paid_off"] }),
    { ok: true },
  );
});

test("canStartReloan allows when borrower has only denied apps", () => {
  assert.deepEqual(
    canStartReloan({ applicationStatuses: ["denied", "paid_off"] }),
    { ok: true },
  );
});

test("canStartReloan allows when borrower has no applications", () => {
  assert.deepEqual(canStartReloan({ applicationStatuses: [] }), { ok: true });
});

test("canStartReloan rejects when documents_pending app exists", () => {
  const result = canStartReloan({
    applicationStatuses: ["paid_off", "documents_pending"],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /ongoing/i);
  }
});

test("canStartReloan rejects when loan_active app exists", () => {
  const result = canStartReloan({
    applicationStatuses: ["loan_active"],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /ongoing/i);
  }
});

test("nextApplicationKind is first when no applications", () => {
  assert.equal(nextApplicationKind({ applicationStatuses: [] }), "first");
});

test("nextApplicationKind is reloan when only terminal apps", () => {
  assert.equal(
    nextApplicationKind({ applicationStatuses: ["paid_off"] }),
    "reloan",
  );
});

test("nextApplicationKind is null when an open app exists", () => {
  assert.equal(
    nextApplicationKind({
      applicationStatuses: ["documents_pending"],
    }),
    null,
  );
});

test("findResumableDraft returns null when no applications", () => {
  assert.equal(findResumableDraft([]), null);
});

test("findResumableDraft returns null when no draft among applications", () => {
  assert.equal(
    findResumableDraft([
      { id: "a", status: "documents_pending" },
      { id: "b", status: "paid_off" },
    ]),
    null,
  );
});

test("findResumableDraft returns the draft application", () => {
  const result = findResumableDraft([
    { id: "a", status: "paid_off" },
    { id: "b", status: "draft" },
  ]);
  assert.equal(result?.id, "b");
});

test("findResumableDraft returns the first draft when somehow more than one exists", () => {
  const result = findResumableDraft([
    { id: "a", status: "draft" },
    { id: "b", status: "draft" },
  ]);
  assert.equal(result?.id, "a");
});

test("a lingering draft is non-terminal and blocks canStartReloan (why resume exists)", () => {
  const result = canStartReloan({ applicationStatuses: ["draft"] });
  assert.equal(result.ok, false);
});
