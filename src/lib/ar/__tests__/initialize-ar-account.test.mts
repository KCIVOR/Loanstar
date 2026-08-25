import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  enrollUnprocessedArQueue,
  initializeArAccount,
} from "../masterlist";

describe("initializeArAccount", () => {
  it("marks ar_queue processed when the masterlist row already exists", async () => {
    let queueUpdate: Record<string, unknown> | null = null;

    const supabase = {
      from(table: string) {
        if (table === "masterlist") {
          return {
            select() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({
                      data: { id: "ml-1" },
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        }
        if (table === "ar_queue") {
          return {
            update(payload: Record<string, unknown>) {
              queueUpdate = payload;
              return {
                eq() {
                  return {
                    is: async () => ({ error: null }),
                  };
                },
              };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const result = await initializeArAccount(
      supabase as never,
      "app-1",
      "rf-1",
      "actor-1",
    );

    assert.deepEqual(result, { masterlistId: "ml-1", created: false });
    assert.equal(queueUpdate?.masterlist_id, "ml-1");
    assert.equal(typeof queueUpdate?.processed_at, "string");
  });
});

describe("enrollUnprocessedArQueue", () => {
  it("returns zeros when the receive queue is empty", async () => {
    const supabase = {
      from(table: string) {
        assert.equal(table, "ar_queue");
        return {
          select() {
            return {
              is: async () => ({ data: [], error: null }),
            };
          },
        };
      },
    };

    const result = await enrollUnprocessedArQueue(supabase as never, "actor-1");
    assert.deepEqual(result, { enrolled: 0, errors: [] });
  });
});
