import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const serviceSrc = read("../release-service.ts");
const routeSrc = read("../../../app/api/lra/applications/[id]/computation/route.ts");
const loanTypesSrc = read("../../../app/api/lra/loan-types/route.ts");

// release-service.ts pulls in server-only modules (next/headers via the
// supabase server client), so the pure status rule is re-stated from source
// here the same way the repo's other route-contract tests work, and the exact
// rule text is asserted below.
function statusAfter(status: string, paths: string[]): string {
  if (status === "released" || status === "closed") throw new Error("released");
  if (status === "awaiting_path") return "awaiting_path";
  return paths.includes("with_pdc") ? "pdc_encoding" : "ready_generate";
}

describe("releaseStatusAfterRecompute (rule)", () => {
  it("is implemented exactly as the rule tested here", () => {
    assert.match(serviceSrc, /if \(status === "released" \|\| status === "closed"\) \{\s*throw new ValidationError\(/);
    assert.match(serviceSrc, /if \(status === "awaiting_path"\) return "awaiting_path";/);
    assert.match(
      serviceSrc,
      /return releasePaths\.includes\("with_pdc"\) \? "pdc_encoding" : "ready_generate";/,
    );
  });

  it("keeps a file that is still choosing its path where it is", () => {
    assert.equal(statusAfter("awaiting_path", []), "awaiting_path");
  });

  it("sends a with-PDC file back to PDC encoding from any later step", () => {
    for (const s of ["pdc_encoding", "ready_generate", "awaiting_signatures", "awaiting_briefing", "ready_release"]) {
      assert.equal(statusAfter(s, ["with_pdc"]), "pdc_encoding", s);
    }
  });

  it("sends a no-PDC file back to document generation", () => {
    for (const s of ["ready_generate", "awaiting_signatures", "awaiting_briefing", "ready_release"]) {
      assert.equal(statusAfter(s, ["without_pdc"]), "ready_generate", s);
    }
  });

  it("refuses once the loan is released or closed", () => {
    assert.throws(() => statusAfter("released", ["with_pdc"]));
    assert.throws(() => statusAfter("closed", ["without_pdc"]));
  });
});

describe("recomputeAtRelease (source contract)", () => {
  it("requires a reason", () => {
    assert.match(serviceSrc, /A reason is required to change the computation/);
  });

  it("clears generated documents and PDC checks, and resets the briefing", () => {
    assert.match(serviceSrc, /\.from\("generated_documents"\)\s*\.delete\(\)\s*\.eq\("release_file_id", file\.id\)/);
    assert.match(serviceSrc, /\.from\("pdc_checks"\)\s*\.delete\(\)\s*\.eq\("release_file_id", file\.id\)/);
    assert.match(serviceSrc, /acknowledged_at: null, acknowledged_by: null/);
  });

  it("repoints the release file and the queue to the new computation", () => {
    assert.match(serviceSrc, /computation_id: computation\.id,\s*status: nextStatus/);
    assert.match(serviceSrc, /\.from\("release_queue"\)\s*\.update\(\{ computation_id: computation\.id \}\)/);
  });

  it("auto-approves under the LRA user and writes an audit event with the reason", () => {
    assert.match(serviceSrc, /witnessed_by: actorId/);
    assert.match(serviceSrc, /trigger: "lra_recompute_at_release"/);
    assert.match(serviceSrc, /reason: trimmedReason/);
  });
});

describe("LRA calculator routes (source contract)", () => {
  it("POST requires release_lra:edit and a non-empty reason", () => {
    assert.match(routeSrc, /requireModulePermission\("release_lra", "edit"\)/);
    assert.match(routeSrc, /reason: z\.string\(\)\.trim\(\)\.min\(1/);
  });

  it("GET requires release_lra:view", () => {
    assert.match(routeSrc, /requireModulePermission\("release_lra", "view"\)/);
    assert.match(loanTypesSrc, /requireModulePermission\("release_lra", "view"\)/);
  });

  it("does not touch the CSA or Committee compute routes", () => {
    const csa = read("../../../app/api/csa/applications/[id]/computation/route.ts");
    const committee = read("../../../app/api/committee/applications/[id]/override/route.ts");
    assert.doesNotMatch(csa, /recomputeAtRelease|release_lra/);
    assert.doesNotMatch(committee, /recomputeAtRelease|release_lra/);
  });
});
