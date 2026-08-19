import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canShowConfirmAction,
  canShowConfirmAllAction,
  canShowRequestRevisionAction,
  confirmableDocumentIds,
  needsRevisionSubtitle,
} from "../checklist-actions";

describe("canShowRequestRevisionAction", () => {
  it("shows for uploaded, confirmed, and needs_revision when API is wired", () => {
    for (const status of ["uploaded", "confirmed", "needs_revision"] as const) {
      assert.equal(
        canShowRequestRevisionAction({
          hasRequestRevisionApi: true,
          documentId: "d1",
          status,
        }),
        true,
      );
    }
  });

  it("hides for pending and when API missing", () => {
    assert.equal(
      canShowRequestRevisionAction({
        hasRequestRevisionApi: true,
        documentId: "d1",
        status: "pending",
      }),
      false,
    );
    assert.equal(
      canShowRequestRevisionAction({
        hasRequestRevisionApi: false,
        documentId: "d1",
        status: "uploaded",
      }),
      false,
    );
  });
});

describe("canShowConfirmAction", () => {
  it("still only confirms uploaded", () => {
    assert.equal(
      canShowConfirmAction({
        hasConfirmApi: true,
        documentId: "d1",
        status: "needs_revision",
      }),
      false,
    );
    assert.equal(
      canShowConfirmAction({
        hasConfirmApi: true,
        documentId: "d1",
        status: "uploaded",
      }),
      true,
    );
  });
});

describe("needsRevisionSubtitle", () => {
  it("includes remarks and file name", () => {
    assert.match(
      needsRevisionSubtitle("Blurry passport", "pass.pdf"),
      /Needs revision: Blurry passport/,
    );
    assert.match(needsRevisionSubtitle("Blurry passport", "pass.pdf"), /pass\.pdf/);
  });
});

describe("confirmableDocumentIds", () => {
  it("returns ids for uploaded rows only", () => {
    assert.deepEqual(
      confirmableDocumentIds([
        { documentId: "u1", status: "uploaded" },
        { documentId: "c1", status: "confirmed" },
        { documentId: null, status: "pending" },
        { documentId: "r1", status: "needs_revision" },
      ]),
      ["u1"],
    );
  });
});

describe("canShowConfirmAllAction", () => {
  it("shows when confirm API is wired and at least one uploaded row exists", () => {
    assert.equal(
      canShowConfirmAllAction({
        hasConfirmApi: true,
        confirmableCount: 2,
      }),
      true,
    );
    assert.equal(
      canShowConfirmAllAction({
        hasConfirmApi: true,
        confirmableCount: 0,
      }),
      false,
    );
    assert.equal(
      canShowConfirmAllAction({
        hasConfirmApi: false,
        confirmableCount: 2,
      }),
      false,
    );
    assert.equal(
      canShowConfirmAllAction({
        hasConfirmApi: true,
        confirmableCount: 2,
        readOnly: true,
      }),
      false,
    );
  });
});
