import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PRIVACY_ORIENTATION_MISSING,
  assessPrivacyOrientation,
  recordPrivacyOrientation,
} from "../privacy-orientation";

describe("Data Privacy Act orientation endorse gate", () => {
  it("treats null orientation as incomplete with the frozen missing label", () => {
    const result = assessPrivacyOrientation(null);
    assert.equal(result.complete, false);
    assert.deepEqual(result.missing, [PRIVACY_ORIENTATION_MISSING]);
    assert.equal(
      PRIVACY_ORIENTATION_MISSING,
      "Data Privacy Act orientation not recorded",
    );
  });

  it("treats whitespace-only as incomplete", () => {
    const result = assessPrivacyOrientation("   ");
    assert.equal(result.complete, false);
    assert.deepEqual(result.missing, [PRIVACY_ORIENTATION_MISSING]);
  });

  it("treats a recorded timestamp as complete", () => {
    const result = assessPrivacyOrientation("2026-07-23T04:00:00.000Z");
    assert.equal(result.complete, true);
    assert.deepEqual(result.missing, []);
  });
});

describe("recordPrivacyOrientation", () => {
  function makeStub(opts: {
    existingAt: string | null;
    existingBy: string | null;
  }) {
    let updated: Record<string, unknown> | null = null;

    const chain = {
      select: () => chain,
      eq: () => chain,
      single: async () => ({
        data: {
          id: "app-1",
          privacy_orientation_at: opts.existingAt,
          privacy_orientation_by: opts.existingBy,
        },
        error: null,
      }),
      update: (payload: Record<string, unknown>) => {
        updated = payload;
        return {
          eq: async () => ({ error: null }),
        };
      },
    };

    return {
      supabase: {
        from(table: string) {
          if (table !== "loan_applications") {
            throw new Error(`unexpected table ${table}`);
          }
          return chain;
        },
      } as never,
      getUpdated: () => updated,
    };
  }

  it("sets timestamps when not yet recorded", async () => {
    const stub = makeStub({ existingAt: null, existingBy: null });
    const result = await recordPrivacyOrientation(
      stub.supabase,
      "app-1",
      "actor-1",
    );
    assert.equal(result.alreadyRecorded, false);
    assert.equal(result.privacyOrientationBy, "actor-1");
    assert.ok(result.privacyOrientationAt);
    assert.equal(stub.getUpdated()?.privacy_orientation_by, "actor-1");
    assert.equal(
      stub.getUpdated()?.privacy_orientation_at,
      result.privacyOrientationAt,
    );
  });

  it("is idempotent and returns existing values on second call", async () => {
    const existingAt = "2026-07-23T01:00:00.000Z";
    const stub = makeStub({
      existingAt,
      existingBy: "actor-original",
    });
    const result = await recordPrivacyOrientation(
      stub.supabase,
      "app-1",
      "actor-2",
    );
    assert.equal(result.alreadyRecorded, true);
    assert.equal(result.privacyOrientationAt, existingAt);
    assert.equal(result.privacyOrientationBy, "actor-original");
    assert.equal(stub.getUpdated(), null);
  });
});
