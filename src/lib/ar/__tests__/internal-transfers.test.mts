import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  postInternalTransfer,
  rejectInternalTransfer,
} from "../internal-transfers";

/**
 * The allocation math (oldest-installment-first, paid/partial thresholds,
 * balance floor-at-zero) now lives entirely inside the `post_internal_transfer`
 * / `reject_internal_transfer` Postgres functions — see
 * `docs/superpowers/plans/2026-08-21-internal-transfer-atomicity-fix.md`.
 * These tests only cover the JS wrapper: that it calls the right RPC with
 * the right args, and maps the RPC's success/error shape correctly.
 */
function fakeSupabase(opts: {
  fnName: string;
  data?: Record<string, unknown> | null;
  errorMessage?: string;
}) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];

  const client = {
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      if (opts.errorMessage) {
        return Promise.resolve({ data: null, error: { message: opts.errorMessage } });
      }
      return Promise.resolve({ data: opts.data ?? null, error: null });
    },
  };

  return { client, calls };
}

describe("postInternalTransfer", () => {
  it("calls post_internal_transfer with the transfer and actor ids, and maps the result", async () => {
    const { client, calls } = fakeSupabase({
      fnName: "post_internal_transfer",
      data: { newBalance: 16126, postedAt: "2026-08-21T00:00:00.000Z" },
    });

    const result = await postInternalTransfer(client as never, "t1", "actor-1");

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.fn, "post_internal_transfer");
    assert.deepEqual(calls[0]!.args, { p_transfer_id: "t1", p_actor_id: "actor-1" });
    assert.equal(result.newBalance, 16126);
    assert.equal(result.postedAt, "2026-08-21T00:00:00.000Z");
  });

  it("refuses to post a transfer that isn't pending — no double-post", async () => {
    const { client } = fakeSupabase({
      fnName: "post_internal_transfer",
      errorMessage: "Transfer is already posted — cannot post again",
    });

    await assert.rejects(
      () => postInternalTransfer(client as never, "t1", "actor-1"),
      /already posted/,
    );
  });
});

describe("rejectInternalTransfer", () => {
  it("calls reject_internal_transfer with the transfer id, actor id, and reason, and maps the result", async () => {
    const { client, calls } = fakeSupabase({
      fnName: "reject_internal_transfer",
      data: { rejectedAt: "2026-08-21T00:00:00.000Z" },
    });

    const result = await rejectInternalTransfer(
      client as never,
      "t1",
      "actor-1",
      "Wrong account",
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.fn, "reject_internal_transfer");
    assert.deepEqual(calls[0]!.args, {
      p_transfer_id: "t1",
      p_actor_id: "actor-1",
      p_reason: "Wrong account",
    });
    assert.equal(result.rejectedAt, "2026-08-21T00:00:00.000Z");
  });

  it("refuses to reject a transfer that isn't pending", async () => {
    const { client } = fakeSupabase({
      fnName: "reject_internal_transfer",
      errorMessage: "Transfer is already rejected — cannot reject",
    });

    await assert.rejects(
      () => rejectInternalTransfer(client as never, "t1", "actor-1", "again"),
      /already rejected/,
    );
  });
});
