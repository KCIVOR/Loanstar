import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isEligibleAgent,
  listEligibleAgents,
  resolveAssignedAgentName,
} from "../agent-assignment";

/**
 * Minimal fake query builder covering only what agent-assignment.ts calls:
 * .from(table).select(...).eq(col, val)[.in(col, vals)][.order(col, opts)]
 * and the two terminal shapes it awaits — the array form (implicit
 * `.then`) and `.maybeSingle()`. Same style as the fakeSupabase helper in
 * src/lib/ar/__tests__/internal-transfers.test.mts, extended for filtering.
 */
type Row = Record<string, unknown>;

function getPath(row: Row, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Row)[key];
    return undefined;
  }, row);
}

function makeFakeClient(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];

      const builder = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          rows = rows.filter((r) => getPath(r, col) === val);
          return builder;
        },
        in(col: string, vals: unknown[]) {
          rows = rows.filter((r) => vals.includes(getPath(r, col) as never));
          return builder;
        },
        order(col: string, opts?: { ascending?: boolean }) {
          const dir = opts?.ascending === false ? -1 : 1;
          rows = [...rows].sort((a, b) => {
            const av = String(getPath(a, col) ?? "");
            const bv = String(getPath(b, col) ?? "");
            return av < bv ? -dir : av > bv ? dir : 0;
          });
          return builder;
        },
        maybeSingle() {
          return Promise.resolve({ data: rows[0] ?? null, error: null });
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

const userRoles: Row[] = [
  { user_id: "agent-active", roles: { slug: "agent", is_active: true } },
  {
    user_id: "agent-inactive-role",
    roles: { slug: "agent", is_active: false },
  },
  { user_id: "staff-user", roles: { slug: "csa", is_active: true } },
  {
    user_id: "agent-inactive-profile",
    roles: { slug: "agent", is_active: true },
  },
];

const profiles: Row[] = [
  { id: "agent-active", full_name: "Alice Agent", is_active: true },
  { id: "agent-inactive-profile", full_name: "Bob Agent", is_active: false },
  { id: "staff-user", full_name: "Staff User", is_active: true },
];

function client() {
  return makeFakeClient({ user_roles: userRoles, profiles }) as never;
}

describe("listEligibleAgents", () => {
  it("returns only active profiles holding the active agent role", async () => {
    const agents = await listEligibleAgents(client());
    assert.deepEqual(agents, [{ id: "agent-active", fullName: "Alice Agent" }]);
  });

  it("excludes an active agent role held by an inactive profile", async () => {
    const agents = await listEligibleAgents(client());
    assert.equal(
      agents.some((a) => a.id === "agent-inactive-profile"),
      false,
    );
  });

  it("excludes a user whose agent role is itself inactive", async () => {
    const agents = await listEligibleAgents(client());
    assert.equal(
      agents.some((a) => a.id === "agent-inactive-role"),
      false,
    );
  });

  it("excludes staff who hold a different role", async () => {
    const agents = await listEligibleAgents(client());
    assert.equal(
      agents.some((a) => a.id === "staff-user"),
      false,
    );
  });
});

describe("isEligibleAgent", () => {
  it("accepts an active agent", async () => {
    assert.equal(await isEligibleAgent(client(), "agent-active"), true);
  });

  it("rejects an inactive profile even with an active agent role", async () => {
    assert.equal(
      await isEligibleAgent(client(), "agent-inactive-profile"),
      false,
    );
  });

  it("rejects a non-agent staff id", async () => {
    assert.equal(await isEligibleAgent(client(), "staff-user"), false);
  });

  it("rejects an unknown id", async () => {
    assert.equal(await isEligibleAgent(client(), "does-not-exist"), false);
  });
});

describe("resolveAssignedAgentName", () => {
  it("returns null when no agent is assigned", async () => {
    assert.equal(await resolveAssignedAgentName(client(), null), null);
    assert.equal(await resolveAssignedAgentName(client(), undefined), null);
  });

  it("returns the full name of an active assigned profile", async () => {
    assert.equal(
      await resolveAssignedAgentName(client(), "agent-active"),
      "Alice Agent",
    );
  });

  it("returns null for an inactive assigned profile", async () => {
    assert.equal(
      await resolveAssignedAgentName(client(), "agent-inactive-profile"),
      null,
    );
  });

  it("returns null for an assignment pointing at a profile that no longer exists", async () => {
    assert.equal(
      await resolveAssignedAgentName(client(), "ghost-user"),
      null,
    );
  });
});
