import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PDC_COLLECT_CLOSE_ERROR,
  PDC_COLLECT_EMPTY_ERROR,
  PDC_COLLECT_PATH_ERROR,
  PDC_COLLECT_STATUS_ERROR,
  assertCanConfirmPdcCollection,
  assertPdcCollectedForClose,
  canConfirmPdcCollection,
  closeRequiresPdcCollection,
  confirmPdcCollected,
  maybePdcCollectBlocker,
  PDC_PHYSICAL_COLLECT_BLOCKER,
} from "../pdc-collect";

type StubOpts = {
  releasePaths: string[] | null;
  status: string;
  pdcCollectedAt: string | null;
  checkCount: number;
};

function makeConfirmStub(opts: StubOpts) {
  let updated: Record<string, unknown> | null = null;

  const releaseChain = {
    select: () => releaseChain,
    eq: () => releaseChain,
    single: async () => ({
      data: {
        id: "rf-1",
        loan_application_id: "app-1",
        release_paths: opts.releasePaths,
        status: opts.status,
        pdc_collected_at: opts.pdcCollectedAt,
        pdc_collected_by: null,
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

  const checksChain = {
    select: () => checksChain,
    eq: () =>
      Promise.resolve({
        count: opts.checkCount,
        error: null,
      }),
  };

  const appsChain = {
    update: () => ({
      eq: () => ({
        eq: async () => ({ error: null }),
      }),
    }),
  };

  const supabase = {
    from(table: string) {
      if (table === "release_files") return releaseChain;
      if (table === "pdc_checks") return checksChain;
      if (table === "loan_applications") return appsChain;
      throw new Error(`unexpected table ${table}`);
    },
  };

  return {
    supabase: supabase as never,
    getUpdated: () => updated,
  };
}

describe("physical PDC collection gates", () => {
  describe("assertCanConfirmPdcCollection / canConfirmPdcCollection", () => {
    it("rejects without_pdc path", () => {
      assert.equal(
        canConfirmPdcCollection({
          releasePaths: ["without_pdc"],
          status: "released",
          pdcCheckCount: 3,
          pdcCollectedAt: null,
        }),
        false,
      );
      assert.throws(
        () =>
          assertCanConfirmPdcCollection({
            releasePaths: ["without_pdc"],
            status: "released",
            pdcCheckCount: 3,
            pdcCollectedAt: null,
          }),
        new RegExp(PDC_COLLECT_PATH_ERROR),
      );
    });

    it("rejects too-early status (before signing complete)", () => {
      for (const status of [
        "awaiting_path",
        "pdc_encoding",
        "ready_generate",
        "awaiting_signatures",
      ] as const) {
        assert.throws(
          () =>
            assertCanConfirmPdcCollection({
              releasePaths: ["with_pdc"],
              status,
              pdcCheckCount: 2,
              pdcCollectedAt: null,
            }),
          new RegExp(PDC_COLLECT_STATUS_ERROR),
        );
      }
    });

    it("rejects zero pdc_checks", () => {
      assert.throws(
        () =>
          assertCanConfirmPdcCollection({
            releasePaths: ["with_pdc"],
            status: "released",
            pdcCheckCount: 0,
            pdcCollectedAt: null,
          }),
        new RegExp(PDC_COLLECT_EMPTY_ERROR),
      );
    });

    it("allows post-sign statuses when checks exist and not yet collected", () => {
      for (const status of [
        "awaiting_briefing",
        "ready_release",
        "released",
      ] as const) {
        assert.doesNotThrow(() =>
          assertCanConfirmPdcCollection({
            releasePaths: ["with_pdc"],
            status,
            pdcCheckCount: 1,
            pdcCollectedAt: null,
          }),
        );
        assert.equal(
          canConfirmPdcCollection({
            releasePaths: ["with_pdc"],
            status,
            pdcCheckCount: 1,
            pdcCollectedAt: null,
          }),
          true,
        );
      }
    });

    it("allows both-selected paths the same as with_pdc-only", () => {
      assert.equal(
        canConfirmPdcCollection({
          releasePaths: ["with_pdc", "without_pdc"],
          status: "released",
          pdcCheckCount: 1,
          pdcCollectedAt: null,
        }),
        true,
      );
      assert.doesNotThrow(() =>
        assertCanConfirmPdcCollection({
          releasePaths: ["with_pdc", "without_pdc"],
          status: "released",
          pdcCheckCount: 1,
          pdcCollectedAt: null,
        }),
      );
    });

    it("rejects when already collected", () => {
      assert.equal(
        canConfirmPdcCollection({
          releasePaths: ["with_pdc"],
          status: "released",
          pdcCheckCount: 2,
          pdcCollectedAt: "2026-07-23T00:00:00.000Z",
        }),
        false,
      );
    });
  });

  describe("assertPdcCollectedForClose / closeRequiresPdcCollection", () => {
    it("requires collection only when with_pdc is selected", () => {
      assert.equal(closeRequiresPdcCollection(["with_pdc"]), true);
      assert.equal(closeRequiresPdcCollection(["without_pdc"]), false);
      assert.equal(
        closeRequiresPdcCollection(["with_pdc", "without_pdc"]),
        true,
      );
      assert.equal(closeRequiresPdcCollection(null), false);
    });

    it("rejects with_pdc without collection", () => {
      assert.throws(
        () =>
          assertPdcCollectedForClose({
            releasePaths: ["with_pdc"],
            pdcCollectedAt: null,
          }),
        new RegExp(PDC_COLLECT_CLOSE_ERROR),
      );
    });

    it("rejects both-selected without collection", () => {
      assert.throws(
        () =>
          assertPdcCollectedForClose({
            releasePaths: ["with_pdc", "without_pdc"],
            pdcCollectedAt: null,
          }),
        new RegExp(PDC_COLLECT_CLOSE_ERROR),
      );
    });

    it("allows without_pdc without collection", () => {
      assert.doesNotThrow(() =>
        assertPdcCollectedForClose({
          releasePaths: ["without_pdc"],
          pdcCollectedAt: null,
        }),
      );
    });

    it("allows with_pdc with collection", () => {
      assert.doesNotThrow(() =>
        assertPdcCollectedForClose({
          releasePaths: ["with_pdc"],
          pdcCollectedAt: "2026-07-23T12:00:00.000Z",
        }),
      );
    });

    it("allows both-selected with collection", () => {
      assert.doesNotThrow(() =>
        assertPdcCollectedForClose({
          releasePaths: ["with_pdc", "without_pdc"],
          pdcCollectedAt: "2026-07-23T12:00:00.000Z",
        }),
      );
    });

    it("surfaces released-stage blocker only for uncollected with_pdc", () => {
      assert.equal(
        maybePdcCollectBlocker({
          releasePaths: ["with_pdc"],
          status: "released",
          pdcCollectedAt: null,
        }),
        PDC_PHYSICAL_COLLECT_BLOCKER,
      );
      assert.equal(
        maybePdcCollectBlocker({
          releasePaths: ["with_pdc", "without_pdc"],
          status: "released",
          pdcCollectedAt: null,
        }),
        PDC_PHYSICAL_COLLECT_BLOCKER,
      );
      assert.equal(
        maybePdcCollectBlocker({
          releasePaths: ["with_pdc"],
          status: "awaiting_briefing",
          pdcCollectedAt: null,
        }),
        null,
      );
      assert.equal(
        maybePdcCollectBlocker({
          releasePaths: ["without_pdc"],
          status: "released",
          pdcCollectedAt: null,
        }),
        null,
      );
    });
  });

  describe("confirmPdcCollected", () => {
    it("rejects wrong path / too-early status / zero pdc_checks", async () => {
      await assert.rejects(
        () =>
          confirmPdcCollected(
            makeConfirmStub({
              releasePaths: ["without_pdc"],
              status: "released",
              pdcCollectedAt: null,
              checkCount: 2,
            }).supabase,
            "rf-1",
            "actor-1",
          ),
        new RegExp(PDC_COLLECT_PATH_ERROR),
      );

      await assert.rejects(
        () =>
          confirmPdcCollected(
            makeConfirmStub({
              releasePaths: ["with_pdc"],
              status: "awaiting_signatures",
              pdcCollectedAt: null,
              checkCount: 2,
            }).supabase,
            "rf-1",
            "actor-1",
          ),
        new RegExp(PDC_COLLECT_STATUS_ERROR),
      );

      await assert.rejects(
        () =>
          confirmPdcCollected(
            makeConfirmStub({
              releasePaths: ["with_pdc"],
              status: "released",
              pdcCollectedAt: null,
              checkCount: 0,
            }).supabase,
            "rf-1",
            "actor-1",
          ),
        new RegExp(PDC_COLLECT_EMPTY_ERROR),
      );
    });

    it("succeeds on allowed statuses and sets timestamp", async () => {
      const stub = makeConfirmStub({
        releasePaths: ["with_pdc"],
        status: "released",
        pdcCollectedAt: null,
        checkCount: 3,
      });

      const result = await confirmPdcCollected(
        stub.supabase,
        "rf-1",
        "actor-1",
      );

      assert.equal(result.pdcCollectedBy, "actor-1");
      assert.ok(result.pdcCollectedAt);
      assert.equal(stub.getUpdated()?.pdc_collected_by, "actor-1");
      assert.equal(
        stub.getUpdated()?.pdc_collected_at,
        result.pdcCollectedAt,
      );
    });

    it("succeeds for both-selected paths", async () => {
      const stub = makeConfirmStub({
        releasePaths: ["with_pdc", "without_pdc"],
        status: "released",
        pdcCollectedAt: null,
        checkCount: 2,
      });

      const result = await confirmPdcCollected(
        stub.supabase,
        "rf-1",
        "actor-1",
      );

      assert.equal(result.pdcCollectedBy, "actor-1");
      assert.ok(result.pdcCollectedAt);
    });
  });
});
