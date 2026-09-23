import test from "node:test";
import assert from "node:assert/strict";

import {
  fetchActiveProfile,
  isActiveProfile,
  type ActiveProfileRow,
} from "@/lib/permissions/active-profile";

// --- isActiveProfile: the pure decision that makes deactivation immediate ---

test("isActiveProfile: active row is allowed", () => {
  assert.equal(isActiveProfile({ id: "u1", is_active: true }), true);
});

test("isActiveProfile: inactive row is rejected", () => {
  assert.equal(isActiveProfile({ id: "u1", is_active: false }), false);
});

test("isActiveProfile: missing row (null) is rejected, same as inactive", () => {
  assert.equal(isActiveProfile(null), false);
});

test("isActiveProfile: undefined row is rejected", () => {
  assert.equal(isActiveProfile(undefined), false);
});

test("isActiveProfile: null is_active on the row is rejected (not === true)", () => {
  assert.equal(isActiveProfile({ id: "u1", is_active: null }), false);
});

// --- fetchActiveProfile: the shared query used by requireAuth(), page.tsx,
// and middleware — a fake client stands in for any Supabase client shape. ---

function fakeSupabaseClient(row: ActiveProfileRow | null, error: unknown = null) {
  const calls: string[] = [];
  return {
    client: {
      from(table: string) {
        calls.push(`from:${table}`);
        return {
          select(cols: string) {
            calls.push(`select:${cols}`);
            return {
              eq(col: string, val: string) {
                calls.push(`eq:${col}:${val}`);
                return {
                  async maybeSingle() {
                    calls.push("maybeSingle");
                    return { data: error ? null : row, error };
                  },
                };
              },
            };
          },
        };
      },
    },
    calls,
  };
}

test("fetchActiveProfile: returns the row when found", async () => {
  const { client } = fakeSupabaseClient({ id: "u1", is_active: true });
  const result = await fetchActiveProfile(client as never, "u1");
  assert.deepEqual(result, { id: "u1", is_active: true });
});

test("fetchActiveProfile: returns null when no row is found", async () => {
  const { client } = fakeSupabaseClient(null);
  const result = await fetchActiveProfile(client as never, "missing-user");
  assert.equal(result, null);
});

test("fetchActiveProfile: returns null (not throw) on a query error", async () => {
  const { client } = fakeSupabaseClient(null, new Error("boom"));
  const result = await fetchActiveProfile(client as never, "u1");
  assert.equal(result, null);
});

test("fetchActiveProfile: scopes the query to the given user id", async () => {
  const { client, calls } = fakeSupabaseClient({ id: "u1", is_active: true });
  await fetchActiveProfile(client as never, "u1");
  assert.ok(calls.includes("from:profiles"));
  assert.ok(calls.includes("eq:id:u1"));
});
