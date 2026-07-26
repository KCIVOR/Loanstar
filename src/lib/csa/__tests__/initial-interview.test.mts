import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PRIVACY_ORIENTATION_MISSING } from "../privacy-orientation";
import {
  INITIAL_INTERVIEW_COMPUTATION_ERROR,
  INITIAL_INTERVIEW_MISSING,
  INITIAL_INTERVIEW_NOTES_REQUIRED,
  NCL_NOT_RECORDED,
  assertCanRecordInitialInterview,
  assertInterviewRecordedForComputation,
  assessInitialInterview,
} from "../initial-interview";

describe("assessInitialInterview", () => {
  it("is incomplete when at is null or notes empty", () => {
    assert.deepEqual(assessInitialInterview({ at: null, notes: "hello" }), {
      complete: false,
      missing: [INITIAL_INTERVIEW_MISSING],
    });
    assert.deepEqual(
      assessInitialInterview({
        at: "2026-07-23T00:00:00Z",
        notes: "   ",
      }),
      { complete: false, missing: [INITIAL_INTERVIEW_MISSING] },
    );
  });

  it("is complete when at and notes are both set", () => {
    assert.deepEqual(
      assessInitialInterview({
        at: "2026-07-23T00:00:00Z",
        notes: "Client confirmed employment and allottee.",
      }),
      { complete: true, missing: [] },
    );
  });

  it("does not care about Clearance upload", () => {
    const result = assessInitialInterview({
      at: "2026-07-23T00:00:00Z",
      notes: "Interview done",
    });
    assert.equal(result.complete, true);
    assert.ok(!result.missing.some((m) => /clearance/i.test(m)));
  });
});

describe("assertCanRecordInitialInterview", () => {
  const okForm = { complete: true, missing: [] as string[] };

  it("rejects without orientation / form / NCL / empty notes", () => {
    assert.throws(
      () =>
        assertCanRecordInitialInterview({
          privacyOrientationAt: null,
          formCompleteness: okForm,
          nclRecorded: true,
          notes: "notes",
        }),
      (err: unknown) =>
        err instanceof Error &&
        err.message.includes(PRIVACY_ORIENTATION_MISSING),
    );

    assert.throws(
      () =>
        assertCanRecordInitialInterview({
          privacyOrientationAt: "2026-07-23T00:00:00Z",
          formCompleteness: {
            complete: false,
            missing: ["Application form: first name"],
          },
          nclRecorded: true,
          notes: "notes",
        }),
      /Application form: first name/,
    );

    assert.throws(
      () =>
        assertCanRecordInitialInterview({
          privacyOrientationAt: "2026-07-23T00:00:00Z",
          formCompleteness: okForm,
          nclRecorded: false,
          notes: "notes",
        }),
      new RegExp(NCL_NOT_RECORDED),
    );

    assert.throws(
      () =>
        assertCanRecordInitialInterview({
          privacyOrientationAt: "2026-07-23T00:00:00Z",
          formCompleteness: okForm,
          nclRecorded: true,
          notes: "  ",
        }),
      new RegExp(INITIAL_INTERVIEW_NOTES_REQUIRED),
    );
  });

  it("allows recording when all prereqs and notes are OK", () => {
    assert.doesNotThrow(() =>
      assertCanRecordInitialInterview({
        privacyOrientationAt: "2026-07-23T00:00:00Z",
        formCompleteness: okForm,
        nclRecorded: true,
        notes: "Spoke with borrower and PIC.",
      }),
    );
  });
});

describe("assertInterviewRecordedForComputation", () => {
  it("blocks computation without interview", () => {
    assert.throws(
      () => assertInterviewRecordedForComputation(null),
      new RegExp(INITIAL_INTERVIEW_COMPUTATION_ERROR),
    );
  });

  it("allows computation when interview recorded", () => {
    assert.doesNotThrow(() =>
      assertInterviewRecordedForComputation("2026-07-23T00:00:00Z"),
    );
  });
});

describe("endorse readiness interview piece", () => {
  it("adds Initial interview not recorded when incomplete", () => {
    const result = assessInitialInterview({ at: null, notes: null });
    assert.equal(result.complete, false);
    assert.deepEqual(result.missing, [INITIAL_INTERVIEW_MISSING]);
  });
});
