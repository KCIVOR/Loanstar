import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { listUsers, usersQuerySchema } from "../service";

/**
 * Route-level authorization note (cannot run under `npm test`, which only
 * globs src/lib/**\/__tests__/*.mts and never src/app/**):
 * GET /api/admin/users keeps `requireModulePermission("auth_admin", "view")`
 * unchanged. A non-`auth_admin:view` actor must get 403 with no directory
 * data. Verify this manually against the running app (Phase 2 live checks),
 * e.g. by signing in as a role without `auth_admin` view access and hitting
 * /api/admin/users directly.
 *
 * Role-slug ground truth (queried live against the Loanstar Supabase
 * project's `roles` table on 2026-09-23):
 *   agent, ar, borrower, collection_head, cig, collector, committee,
 *   csa, lra, remedial, super_admin
 * `borrower` is the only non-staff slug; every other slug is staff.
 */

type Row = Record<string, unknown>;

function getPath(row: Row, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Row)[key];
    return undefined;
  }, row);
}

/**
 * Minimal fake query builder covering what service.ts calls:
 * .from(table).select(cols[, {count}]).eq/.neq/.in/.or(...).order(...).range(from,to)
 * plus the implicit `.then` terminal, same style as the fakeSupabase helper
 * in src/lib/csa/__tests__/agent-assignment.test.mts. `count` is computed
 * from the filtered set *before* `.range()` slices it, matching Supabase's
 * `count: 'exact'` + range semantics.
 */
function makeFakeClient(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      let countRequested = false;
      let count: number | null = null;

      const builder = {
        select(_cols: string, opts?: { count?: string }) {
          if (opts?.count === "exact") countRequested = true;
          return builder;
        },
        eq(col: string, val: unknown) {
          rows = rows.filter((r) => getPath(r, col) === val);
          return builder;
        },
        neq(col: string, val: unknown) {
          rows = rows.filter((r) => getPath(r, col) !== val);
          return builder;
        },
        in(col: string, vals: unknown[]) {
          rows = rows.filter((r) => vals.includes(getPath(r, col) as never));
          return builder;
        },
        or(expr: string) {
          const conditions = expr.split(",").map((c) => c.trim());
          rows = rows.filter((r) =>
            conditions.some((cond) => {
              const m = cond.match(/^(.+)\.ilike\.%(.*)%$/);
              if (!m) return false;
              const [, col, term] = m;
              const value = String(getPath(r, col) ?? "").toLowerCase();
              return value.includes(term.toLowerCase());
            }),
          );
          return builder;
        },
        order() {
          return builder;
        },
        range(from: number, to: number) {
          count = rows.length;
          rows = rows.slice(from, to + 1);
          return builder;
        },
        maybeSingle() {
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
        then(
          onFulfilled: (v: {
            data: Row[];
            error: null;
            count: number | null;
          }) => unknown,
          onRejected?: (e: unknown) => unknown,
        ) {
          return Promise.resolve({
            data: rows,
            error: null,
            count: countRequested ? (count ?? rows.length) : null,
          }).then(onFulfilled, onRejected);
        },
      };

      return builder;
    },
  };
}

const ROLE_BORROWER = { id: "role-borrower", slug: "borrower", name: "Borrower" };
const ROLE_CSA = { id: "role-csa", slug: "csa", name: "CSA" };
const ROLE_AGENT = { id: "role-agent", slug: "agent", name: "Agent" };

const profiles: Row[] = [
  {
    id: "u1",
    email: "alice@example.com",
    full_name: "Alice Smith",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "u2",
    email: "bob@example.com",
    full_name: "Bob Jones",
    is_active: false,
    created_at: "2026-01-02T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  },
  {
    id: "u3",
    email: "carol@example.com",
    full_name: "Carol Multi",
    is_active: true,
    created_at: "2026-01-03T00:00:00Z",
    updated_at: "2026-01-03T00:00:00Z",
  },
  {
    id: "u4",
    email: "dave@example.com",
    full_name: "Dave Borrower",
    is_active: true,
    created_at: "2026-01-04T00:00:00Z",
    updated_at: "2026-01-04T00:00:00Z",
  },
];

const userRoles: Row[] = [
  { user_id: "u1", role_id: ROLE_CSA.id, roles: ROLE_CSA },
  { user_id: "u2", role_id: ROLE_AGENT.id, roles: ROLE_AGENT },
  { user_id: "u3", role_id: ROLE_CSA.id, roles: ROLE_CSA },
  { user_id: "u3", role_id: ROLE_AGENT.id, roles: ROLE_AGENT },
  { user_id: "u4", role_id: ROLE_BORROWER.id, roles: ROLE_BORROWER },
];

const roles: Row[] = [ROLE_BORROWER, ROLE_CSA, ROLE_AGENT];

function client() {
  return makeFakeClient({ profiles, user_roles: userRoles, roles }) as never;
}

describe("listUsers", () => {
  it("searches case-insensitively across email and full_name", async () => {
    const result = await listUsers(client(), { q: "BOB" });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.id, "u2");
  });

  it("filters by active status", async () => {
    const result = await listUsers(client(), { status: "active" });
    assert.ok(result.items.every((u) => u.is_active));
    assert.equal(
      result.items.some((u) => u.id === "u2"),
      false,
    );
  });

  it("filters by inactive status", async () => {
    const result = await listUsers(client(), { status: "inactive" });
    assert.deepEqual(
      result.items.map((u) => u.id),
      ["u2"],
    );
  });

  it("filters by role id and returns a multi-role user only once", async () => {
    const result = await listUsers(client(), { roleId: ROLE_CSA.id });
    const ids = result.items.map((u) => u.id).sort();
    assert.deepEqual(ids, ["u1", "u3"]);
    assert.equal(result.total, 2);
  });

  it("returns empty items and total zero for no matches", async () => {
    const result = await listUsers(client(), { q: "no-such-user-zzz" });
    assert.deepEqual(result.items, []);
    assert.equal(result.total, 0);
  });

  it('classifies audience "borrower" from the live-verified borrower role slug', async () => {
    const result = await listUsers(client(), { audience: "borrower" });
    assert.deepEqual(
      result.items.map((u) => u.id),
      ["u4"],
    );
  });

  it('classifies audience "staff" as any user holding a non-borrower role', async () => {
    const result = await listUsers(client(), { audience: "staff" });
    const ids = result.items.map((u) => u.id).sort();
    assert.deepEqual(ids, ["u1", "u2", "u3"]);
  });

  it("clamps limit to 100 via the query schema", async () => {
    const parsed = usersQuerySchema.parse({ limit: "101" });
    assert.equal(parsed.limit, 100);
    const result = await listUsers(client(), { limit: parsed.limit });
    assert.equal(result.limit, 100);
  });

  it("rejects an invalid role UUID at the schema level", () => {
    const parsed = usersQuerySchema.safeParse({ roleId: "not-a-uuid" });
    assert.equal(parsed.success, false);
  });

  it("accepts a well-formed request shape (limit=20&offset=0)", () => {
    const parsed = usersQuerySchema.parse({ limit: "20", offset: "0" });
    assert.equal(parsed.roleId, undefined);
    assert.deepEqual(
      { q: parsed.q, status: parsed.status, audience: parsed.audience, limit: parsed.limit, offset: parsed.offset },
      { q: "", status: "all", audience: "all", limit: 20, offset: 0 },
    );
  });
});
