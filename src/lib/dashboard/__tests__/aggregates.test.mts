import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildLeadsWidget } from "../aggregates";

/**
 * Minimal fake query builder covering only what buildLeadsWidget calls:
 * .from(table).select(...).order(...)[.eq(...)][.neq(...)], resolved via
 * the implicit `.then` (array) terminal shape. Same style as the
 * fakeSupabase helper in src/lib/csa/__tests__/agent-assignment.test.mts.
 */
type Row = Record<string, unknown>;

function makeFakeClient(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];

      const builder = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          rows = rows.filter((r) => r[col] === val);
          return builder;
        },
        neq(col: string, val: unknown) {
          rows = rows.filter((r) => r[col] !== val);
          return builder;
        },
        order() {
          return builder;
        },
        then(
          onFulfilled: (v: { data: Row[]; error: null }) => unknown,
          onRejected?: (e: unknown) => unknown,
        ) {
          return Promise.resolve({ data: rows, error: null }).then(
            onFulfilled,
            onRejected,
          );
        },
      };

      return builder;
    },
  };
}

const AGENT_A = "agent-a";
const AGENT_B = "agent-b";

const leads: Row[] = [
  {
    id: "lead-a",
    borrower_name: "Borrower A",
    status: "new",
    created_at: "2026-09-01T00:00:00.000Z",
    application_id: null,
    agent_user_id: AGENT_A,
  },
  {
    id: "lead-b",
    borrower_name: "Borrower B",
    status: "new",
    created_at: "2026-09-02T00:00:00.000Z",
    application_id: null,
    agent_user_id: AGENT_B,
  },
];

const applications: Row[] = [
  { status: "for_verification", agent_user_id: AGENT_A },
  { status: "for_verification", agent_user_id: AGENT_B },
  // Historical unassigned application: not draft, but no owning agent —
  // must never be attributed to any agent's funnel.
  { status: "released", agent_user_id: null },
  // Drafts are excluded from the funnel for both scopes.
  { status: "draft", agent_user_id: AGENT_A },
];

function client() {
  return makeFakeClient({ leads, loan_applications: applications }) as never;
}

describe("buildLeadsWidget", () => {
  it("scopes an agent to only their own leads and funnel rows", async () => {
    const widget = await buildLeadsWidget(client(), { kind: "agent", userId: AGENT_A });

    assert.equal(widget.totalLeads, 1);
    assert.equal(
      widget.recentLeads.some((l) => l.id === "lead-b"),
      false,
    );
    assert.deepEqual(
      widget.recentLeads.map((l) => l.id),
      ["lead-a"],
    );
    // Funnel should only reflect Agent A's non-draft application(s).
    const funnelTotal = widget.funnel.reduce((sum, f) => sum + f.count, 0);
    assert.equal(funnelTotal, 1);
    assert.deepEqual(widget.funnel, [{ status: "for_verification", count: 1 }]);
  });

  it("scopes a different agent to only their own rows", async () => {
    const widget = await buildLeadsWidget(client(), { kind: "agent", userId: AGENT_B });

    assert.equal(widget.totalLeads, 1);
    assert.deepEqual(
      widget.recentLeads.map((l) => l.id),
      ["lead-b"],
    );
    assert.deepEqual(widget.funnel, [{ status: "for_verification", count: 1 }]);
  });

  it("gives an aggregate scope the combined, unfiltered totals (today's behavior)", async () => {
    const widget = await buildLeadsWidget(client(), { kind: "aggregate" });

    assert.equal(widget.totalLeads, 2);
    assert.deepEqual(
      widget.recentLeads.map((l) => l.id).sort(),
      ["lead-a", "lead-b"],
    );
    // Aggregate funnel excludes drafts but includes the null-owned historical
    // application, matching current unfiltered behavior.
    const funnelTotal = widget.funnel.reduce((sum, f) => sum + f.count, 0);
    assert.equal(funnelTotal, 3);
  });
});
