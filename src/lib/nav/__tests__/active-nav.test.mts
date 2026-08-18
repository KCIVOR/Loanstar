import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveActiveChildHref } from "../active-nav";

const collectorChildren = [
  { href: "/collector", label: "Overview", exact: true },
  { href: "/collector/accounts", label: "Accounts" },
  { href: "/collector/proofs", label: "Payment proofs" },
  { href: "/collector/dcr", label: "DCRR" },
  { href: "/collector/dcr/history", label: "DCRR history" },
  { href: "/collector/history", label: "History" },
];

const agentChildren = [
  {
    href: "/agent",
    label: "Leads pipeline",
    exact: true,
    matchPrefixes: ["/agent/leads"],
  },
  { href: "/agent/history", label: "Closed leads" },
];

describe("resolveActiveChildHref", () => {
  it("highlights only the most specific sibling for a nested route", () => {
    assert.equal(
      resolveActiveChildHref("/collector/dcr/history", collectorChildren),
      "/collector/dcr/history",
    );
  });

  it("still highlights the parent route when it is the exact path", () => {
    assert.equal(
      resolveActiveChildHref("/collector/dcr", collectorChildren),
      "/collector/dcr",
    );
  });

  it("highlights a child for its own deeper detail pages", () => {
    assert.equal(
      resolveActiveChildHref(
        "/collector/accounts/abc-123/case-file",
        collectorChildren,
      ),
      "/collector/accounts",
    );
  });

  it("keeps exact children inactive on sibling routes", () => {
    assert.equal(
      resolveActiveChildHref("/collector/history", collectorChildren),
      "/collector/history",
    );
  });

  it("honours extra match prefixes on exact children", () => {
    assert.equal(
      resolveActiveChildHref("/agent/leads/42", agentChildren),
      "/agent",
    );
    assert.equal(
      resolveActiveChildHref("/agent/history", agentChildren),
      "/agent/history",
    );
  });

  it("requires a segment boundary so similar paths do not match", () => {
    assert.equal(
      resolveActiveChildHref("/collector/dcrr-export", collectorChildren),
      null,
    );
  });

  it("returns null when nothing matches", () => {
    assert.equal(resolveActiveChildHref("/reports", collectorChildren), null);
  });
});
