import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Source-scan regression locks for the two load-bearing decisions of the
 * Co-Borrower feature that have no natural unit-test seam (they live inside
 * DB-touching server functions this codebase does not mock):
 *
 *  1. Committee's approve-time flag write touches ONLY `co_borrower_required`
 *     + `co_borrower_required_by` — never `blocker` (a missing co-borrower is
 *     not a hold; `blocker` feeds bottleneck/TAT reports).
 *  2. `queueForLra` has NO co-borrower branch — the requirement is advisory
 *     only and never gates a release.
 */

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, "..", "..", "..");
const read = (...p: string[]) => readFileSync(join(srcRoot, ...p), "utf8");

describe("co-borrower — advisory-only invariants (source scan)", () => {
  const actions = read("lib", "committee", "actions.ts");

  it("the approve-time write is gated on requireCoBorrower", () => {
    assert.ok(
      actions.includes(
        'if (action === "approve" && options?.requireCoBorrower === true) {',
      ),
      "expected the co-borrower flag write to be gated on approve + requireCoBorrower",
    );
  });

  it("the approve-time write sets exactly the flag + who-set-it, never blocker", () => {
    assert.ok(
      actions.includes(
        ".update({ co_borrower_required: true, co_borrower_required_by: actorId })",
      ),
      "expected the exact two-field update; if this changed, make sure `blocker` was not added",
    );
  });

  it("executeFinalAction still clears blocker unconditionally (unchanged behaviour)", () => {
    assert.ok(
      actions.includes("blocker: null"),
      "the pre-existing unconditional `blocker: null` clear must remain",
    );
  });

  it("queueForLra contains no co-borrower gate", () => {
    const service = read("lib", "negotiation", "service.ts");
    const start = service.indexOf("function queueForLra");
    assert.ok(start !== -1, "queueForLra not found in negotiation/service.ts");
    const rest = service.slice(start);
    const nextExport = rest.indexOf("\nexport ", 1);
    const body = nextExport === -1 ? rest : rest.slice(0, nextExport);
    assert.ok(
      !/co_?borrower/i.test(body),
      "queueForLra must not reference co-borrower — the requirement is advisory, never a release gate",
    );
  });
});
