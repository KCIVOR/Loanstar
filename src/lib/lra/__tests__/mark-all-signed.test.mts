import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canShowMarkAllSigned,
  unsignedGeneratedDocumentIds,
} from "../mark-all-signed";
import { witnessSignAllGeneratedDocuments } from "../release-service";

type GeneratedDoc = {
  id: string;
  signed_at: string | null;
  is_finalized: boolean;
  content_hash: string;
};

type SignAllStubOpts = {
  status: string;
  docs: GeneratedDoc[];
};

function makeSignAllStub(opts: SignAllStubOpts) {
  const docs = opts.docs.map((doc) => ({ ...doc }));
  const loadedDocIds: string[] = [];
  const documentUpdates: Array<{ id: string; payload: Record<string, unknown> }> =
    [];
  let inFlightDocLoads = 0;
  let maxConcurrentDocLoads = 0;

  function makeGeneratedDocumentsChain() {
    let mode: "select" | "update" = "select";
    let updatePayload: Record<string, unknown> | null = null;
    const filters: Record<string, string> = {};

    const settle = () => {
      if (mode === "update") {
        const id = filters.id;
        const doc = docs.find((row) => row.id === id);
        if (doc && updatePayload) {
          if (typeof updatePayload.signed_at === "string") {
            doc.signed_at = updatePayload.signed_at;
          }
          documentUpdates.push({ id, payload: { ...updatePayload } });
        }
        inFlightDocLoads = Math.max(0, inFlightDocLoads - 1);
        return { error: null };
      }

      return {
        data: docs.map((row) => ({
          id: row.id,
          signed_at: row.signed_at,
          is_finalized: row.is_finalized,
        })),
        error: null,
      };
    };

    const chain = {
      select() {
        mode = "select";
        updatePayload = null;
        return chain;
      },
      update(payload: Record<string, unknown>) {
        mode = "update";
        updatePayload = payload;
        return chain;
      },
      eq(column: string, value: string) {
        filters[column] = value;
        if (mode === "select" && column === "id") {
          loadedDocIds.push(value);
          inFlightDocLoads += 1;
          maxConcurrentDocLoads = Math.max(
            maxConcurrentDocLoads,
            inFlightDocLoads,
          );
        }
        return chain;
      },
      async single() {
        const doc = docs.find((row) => row.id === filters.id);
        if (!doc) {
          return { data: null, error: { message: "not found" } };
        }
        return {
          data: {
            ...doc,
            release_file_id: "rf-1",
            release_files: {
              loan_application_id: "app-1",
              status: opts.status,
            },
          },
          error: null,
        };
      },
      then(
        onFulfilled: (value: unknown) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        return Promise.resolve(settle()).then(onFulfilled, onRejected);
      },
    };

    return chain;
  }

  const supabase = {
    from(table: string) {
      if (table === "release_files") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: {
                      id: "rf-1",
                      loan_application_id: "app-1",
                      status: opts.status,
                    },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }

      if (table === "generated_documents") {
        return makeGeneratedDocumentsChain();
      }

      if (table === "loan_applications") {
        return {
          select() {
            return {
              eq() {
                return {
                  single: async () => ({
                    data: { borrowers: { user_id: "borrower-1" } },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }

      throw new Error(`unexpected table ${table}`);
    },
  };

  return {
    supabase: supabase as never,
    getLoadedDocIds: () => [...loadedDocIds],
    getDocumentUpdates: () => documentUpdates,
    getMaxConcurrentDocLoads: () => maxConcurrentDocLoads,
  };
}

describe("unsignedGeneratedDocumentIds", () => {
  it("returns only unsigned, non-finalized ids", () => {
    assert.deepEqual(
      unsignedGeneratedDocumentIds([
        { id: "a", signed_at: null, is_finalized: false },
        { id: "b", signed_at: "2026-08-19T00:00:00Z", is_finalized: false },
        { id: "c", signed_at: null, is_finalized: true },
      ]),
      ["a"],
    );
  });
});

describe("canShowMarkAllSigned", () => {
  it("shows only during awaiting_signatures when at least one unsigned doc remains", () => {
    assert.equal(
      canShowMarkAllSigned({
        releaseStatus: "awaiting_signatures",
        unsignedCount: 3,
      }),
      true,
    );
    assert.equal(
      canShowMarkAllSigned({
        releaseStatus: "awaiting_signatures",
        unsignedCount: 0,
      }),
      false,
    );
    assert.equal(
      canShowMarkAllSigned({
        releaseStatus: "awaiting_briefing",
        unsignedCount: 1,
      }),
      false,
    );
  });
});

describe("witnessSignAllGeneratedDocuments", () => {
  it("throws before any per-doc sign when release status is not awaiting_signatures", async () => {
    const stub = makeSignAllStub({
      status: "awaiting_briefing",
      docs: [
        {
          id: "u1",
          signed_at: null,
          is_finalized: false,
          content_hash: "h-u1",
        },
      ],
    });

    await assert.rejects(
      () =>
        witnessSignAllGeneratedDocuments(stub.supabase, "app-1", "witness-1"),
      /Release file is not in the signing stage/,
    );

    assert.deepEqual(stub.getLoadedDocIds(), []);
    assert.equal(stub.getDocumentUpdates().length, 0);
  });

  it("throws when every document is already signed", async () => {
    const stub = makeSignAllStub({
      status: "awaiting_signatures",
      docs: [
        {
          id: "s1",
          signed_at: "2026-08-01T00:00:00.000Z",
          is_finalized: false,
          content_hash: "h-s1",
        },
        {
          id: "s2",
          signed_at: "2026-08-01T00:00:00.000Z",
          is_finalized: false,
          content_hash: "h-s2",
        },
      ],
    });

    await assert.rejects(
      () =>
        witnessSignAllGeneratedDocuments(stub.supabase, "app-1", "witness-1"),
      /No unsigned documents/,
    );

    assert.deepEqual(stub.getLoadedDocIds(), []);
    assert.equal(stub.getDocumentUpdates().length, 0);
  });

  it("signs only unsigned non-finalized docs sequentially and leaves allSigned false", async () => {
    const stub = makeSignAllStub({
      status: "awaiting_signatures",
      docs: [
        {
          id: "s1",
          signed_at: "2026-08-01T00:00:00.000Z",
          is_finalized: false,
          content_hash: "h-s1",
        },
        {
          id: "u1",
          signed_at: null,
          is_finalized: false,
          content_hash: "h-u1",
        },
        {
          id: "fin",
          signed_at: null,
          is_finalized: true,
          content_hash: "h-fin",
        },
        {
          id: "u2",
          signed_at: null,
          is_finalized: false,
          content_hash: "h-u2",
        },
        {
          id: "s2",
          signed_at: "2026-08-01T00:00:00.000Z",
          is_finalized: false,
          content_hash: "h-s2",
        },
      ],
    });

    const result = await witnessSignAllGeneratedDocuments(
      stub.supabase,
      "app-1",
      "witness-1",
    );

    assert.equal(result.signedCount, 2);
    assert.equal(result.allSigned, false);
    assert.deepEqual(stub.getLoadedDocIds(), ["u1", "u2"]);
    assert.equal(stub.getDocumentUpdates().length, 2);
    assert.deepEqual(
      stub.getDocumentUpdates().map((row) => row.id),
      ["u1", "u2"],
    );
    assert.equal(stub.getMaxConcurrentDocLoads(), 1);
    for (const update of stub.getDocumentUpdates()) {
      assert.equal(update.payload.witnessed_by, "witness-1");
      assert.equal(update.payload.signed_by, "borrower-1");
      assert.ok(update.payload.signed_at);
      assert.ok(update.payload.signature_hash);
    }
  });
});
