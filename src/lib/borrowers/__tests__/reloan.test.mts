import test from "node:test";
import assert from "node:assert/strict";

import {
  canStartReloan,
  findResumableDraft,
  nextApplicationKind,
  resolveBorrowerCreateSegment,
  resolveReloanSegment,
} from "../reloan";

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

// resolveReloanSegment — a repeat SME borrower must not silently get a Seafarer file.

test("resolveReloanSegment: first application is always Seafarer (no self-declared SME)", () => {
  assert.deepEqual(
    resolveReloanSegment({ isReloan: false }),
    { segment: "seafarer", entityType: null },
  );
});

test("resolveReloanSegment: first application ignores any parent values", () => {
  assert.deepEqual(
    resolveReloanSegment({
      isReloan: false,
      parentSegment: "sme",
      parentEntityType: "corporate",
    }),
    { segment: "seafarer", entityType: null },
  );
});

test("resolveReloanSegment: reloan inherits SME + individual", () => {
  assert.deepEqual(
    resolveReloanSegment({
      isReloan: true,
      parentSegment: "sme",
      parentEntityType: "individual",
    }),
    { segment: "sme", entityType: "individual" },
  );
});

test("resolveReloanSegment: reloan inherits SME + corporate", () => {
  assert.deepEqual(
    resolveReloanSegment({
      isReloan: true,
      parentSegment: "sme",
      parentEntityType: "corporate",
    }),
    { segment: "sme", entityType: "corporate" },
  );
});

test("resolveReloanSegment: Seafarer parent stays Seafarer", () => {
  assert.deepEqual(
    resolveReloanSegment({
      isReloan: true,
      parentSegment: "seafarer",
      parentEntityType: null,
    }),
    { segment: "seafarer", entityType: null },
  );
});

test("resolveReloanSegment: SME parent with missing entity type falls back to Seafarer, not a rejected insert", () => {
  assert.deepEqual(
    resolveReloanSegment({
      isReloan: true,
      parentSegment: "sme",
      parentEntityType: null,
    }),
    { segment: "seafarer", entityType: null },
  );
});

test("resolveReloanSegment: unknown entity type is not inherited", () => {
  assert.deepEqual(
    resolveReloanSegment({
      isReloan: true,
      parentSegment: "sme",
      parentEntityType: "partnership",
    }),
    { segment: "seafarer", entityType: null },
  );
});

test("resolveReloanSegment: missing parent (no prior app) is Seafarer", () => {
  assert.deepEqual(
    resolveReloanSegment({ isReloan: true }),
    { segment: "seafarer", entityType: null },
  );
});

// resolveBorrowerCreateSegment — borrower self-serve create. Explicit
// bodySegment is honored for first and reloan; omit/null falls back by kind.

test("resolveBorrowerCreateSegment: first with no body is Seafarer (byte-compatible with old clients)", () => {
  assert.deepEqual(resolveBorrowerCreateSegment({ kind: "first" }), {
    ok: true,
    scope: { segment: "seafarer", entityType: null },
  });
});

test("resolveBorrowerCreateSegment: first + sme + individual", () => {
  assert.deepEqual(
    resolveBorrowerCreateSegment({
      kind: "first",
      bodySegment: "sme",
      bodyEntityType: "individual",
    }),
    { ok: true, scope: { segment: "sme", entityType: "individual" } },
  );
});

test("resolveBorrowerCreateSegment: first + sme + corporate", () => {
  assert.deepEqual(
    resolveBorrowerCreateSegment({
      kind: "first",
      bodySegment: "sme",
      bodyEntityType: "corporate",
    }),
    { ok: true, scope: { segment: "sme", entityType: "corporate" } },
  );
});

test("resolveBorrowerCreateSegment: first + sme without entityType is rejected", () => {
  const result = resolveBorrowerCreateSegment({
    kind: "first",
    bodySegment: "sme",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /entityType/i);
  }
});

test("resolveBorrowerCreateSegment: first + sme with invalid entityType is rejected", () => {
  const result = resolveBorrowerCreateSegment({
    kind: "first",
    bodySegment: "sme",
    bodyEntityType: "partnership",
  });
  assert.equal(result.ok, false);
});

test("resolveBorrowerCreateSegment: first + seafarer with entityType nullifies entityType", () => {
  assert.deepEqual(
    resolveBorrowerCreateSegment({
      kind: "first",
      bodySegment: "seafarer",
      bodyEntityType: "individual",
    }),
    { ok: true, scope: { segment: "seafarer", entityType: null } },
  );
});

test("resolveBorrowerCreateSegment: first with invalid segment is rejected", () => {
  const result = resolveBorrowerCreateSegment({
    kind: "first",
    bodySegment: "car",
  });
  assert.equal(result.ok, false);
});

test("resolveBorrowerCreateSegment: reloan with explicit seafarer overrides parent SME", () => {
  assert.deepEqual(
    resolveBorrowerCreateSegment({
      kind: "reloan",
      bodySegment: "seafarer",
      parentSegment: "sme",
      parentEntityType: "corporate",
    }),
    { ok: true, scope: { segment: "seafarer", entityType: null } },
  );
});

test("resolveBorrowerCreateSegment: reloan with explicit sme overrides parent Seafarer", () => {
  assert.deepEqual(
    resolveBorrowerCreateSegment({
      kind: "reloan",
      bodySegment: "sme",
      bodyEntityType: "individual",
      parentSegment: "seafarer",
      parentEntityType: null,
    }),
    { ok: true, scope: { segment: "sme", entityType: "individual" } },
  );
});

test("resolveBorrowerCreateSegment: reloan with no body inherits parent (SME)", () => {
  assert.deepEqual(
    resolveBorrowerCreateSegment({
      kind: "reloan",
      parentSegment: "sme",
      parentEntityType: "corporate",
    }),
    { ok: true, scope: { segment: "sme", entityType: "corporate" } },
  );
});

test("resolveBorrowerCreateSegment: reloan with no body inherits parent (Seafarer)", () => {
  assert.deepEqual(
    resolveBorrowerCreateSegment({
      kind: "reloan",
      parentSegment: "seafarer",
      parentEntityType: null,
    }),
    { ok: true, scope: { segment: "seafarer", entityType: null } },
  );
});

test("resolveBorrowerCreateSegment: reloan + sme without entityType is rejected", () => {
  const result = resolveBorrowerCreateSegment({
    kind: "reloan",
    bodySegment: "sme",
    parentSegment: "seafarer",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /entityType/i);
  }
});
