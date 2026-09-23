import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// Route handlers under src/app/api/** transitively import next/headers via
// @/lib/supabase/server (createClient() calls cookies()), which throws
// outside an active Next.js request scope. Actually invoking the exported
// POST handler here (as opposed to reading its source) is not viable in this
// test runner — this repo's own precedent for testing route contracts
// (src/lib/collector/__tests__/payment-review-route-contract.test.mts) reads
// the route source and asserts on it instead of calling it. This file
// follows that same convention rather than the plan's literal phrasing of
// "importing the route module's exported handler directly" — see the final
// report for this deviation.
const actionsSrc = readFileSync(
  new URL("../actions.ts", import.meta.url),
  "utf8",
);
const routeSrc = readFileSync(
  new URL(
    "../../../app/api/committee/applications/[id]/action/route.ts",
    import.meta.url,
  ),
  "utf8",
);

describe("committee action route — clear_hold authorization/status contract", () => {
  it("still gates every committee final action (including clear_hold) behind execute_trigger", () => {
    assert.match(routeSrc, /requireModulePermission\("committee",\s*"execute_trigger"\)/);
  });

  it("accepts clear_hold as a valid action in the request schema", () => {
    assert.match(routeSrc, /z\.enum\(\[[^\]]*"clear_hold"[^\]]*\]\)/);
  });

  it("does not fire approve/deny email side effects for clear_hold", () => {
    // These are gated by literal `body.action === "deny"` / `"approve"`
    // checks — clear_hold must not match either, so no denial/approval
    // email path executes for it.
    assert.match(routeSrc, /body\.action === "deny"/);
    assert.match(routeSrc, /body\.action === "approve"/);
    assert.doesNotMatch(routeSrc, /body\.action === "clear_hold"/);
  });
});

describe("committee actions library — clear_hold vote-check skip (Open Question)", () => {
  it("skips assertAllVotesCast specifically for clear_hold, per the plan's recommendation", () => {
    // Guards against the stranding scenario: committee size can grow after
    // an application enters committee_hold, and there is no way to cast a
    // missing vote from that status (RLS only allows new committee_votes
    // rows while status = 'for_approval'). clear_hold re-queues rather than
    // re-decides, so it must not call assertAllVotesCast.
    const guardedCall =
      /if\s*\(\s*action\s*!==\s*"clear_hold"\s*\)\s*\{[^}]*assertAllVotesCast\(/s;
    assert.match(actionsSrc, guardedCall);
  });

  it("does not run approval-only side effects (negotiations/denial/revisit notices) for clear_hold", () => {
    // executeFinalAction's negotiations/denial_notices/revisit_notices writes
    // are each gated by their own `if (action === "approve"/"deny"/"revisit"
    // && ...)` block (unchanged by this task) — none of them mention
    // clear_hold, so a clear_hold call falls through all three untouched.
    assert.match(actionsSrc, /if \(action === "approve"\) \{[\s\S]*?negotiations/);
    assert.match(actionsSrc, /if \(action === "deny"\) \{[\s\S]*?denial_notices/);
    assert.match(
      actionsSrc,
      /if \(action === "revisit" && options\?\.revisitRoute\) \{[\s\S]*?revisit_notices/,
    );
    assert.doesNotMatch(actionsSrc, /clear_hold[\s\S]{0,80}(negotiations|denial_notices|revisit_notices)/);
    assert.doesNotMatch(actionsSrc, /(negotiations|denial_notices|revisit_notices)[\s\S]{0,80}clear_hold/);
  });

  it("inserts a distinct clear_hold committee_actions row and transitions to for_approval", () => {
    assert.match(actionsSrc, /case "clear_hold":\s*\n\s*return "for_approval";/);
  });
});
