import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canShowConfirmAction,
  canShowRequestRevisionAction,
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
