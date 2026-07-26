import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  maskTwilioAuthToken,
  shouldApplySecretPatch,
} from "../config-mask";
import { normalizePhMobile } from "../phone";
import {
  pickUpcomingInstallment,
  type ReminderScheduleRow,
} from "../../collector/reminder-scan";

describe("PH mobile normalization (Phase 12)", () => {
  it("converts 09… to +639…", () => {
    assert.equal(normalizePhMobile("09171234567"), "+639171234567");
    assert.equal(normalizePhMobile("0917 123 4567"), "+639171234567");
  });

  it("accepts +639… and 639…", () => {
    assert.equal(normalizePhMobile("+639171234567"), "+639171234567");
    assert.equal(normalizePhMobile("639171234567"), "+639171234567");
  });

  it("rejects invalid numbers", () => {
    assert.equal(normalizePhMobile(""), null);
    assert.equal(normalizePhMobile("12345"), null);
    assert.equal(normalizePhMobile("08171234567"), null);
  });
});

describe("Twilio token masking (Phase 12)", () => {
  it("masks with bullets and last 4", () => {
    assert.equal(maskTwilioAuthToken("abcdefghijklmnopqrstuv"), "•••stuv");
    assert.equal(maskTwilioAuthToken("abcd"), "•••abcd");
  });

  it("skips PATCH when client sends masked value back", () => {
    assert.equal(shouldApplySecretPatch("•••stuv"), false);
    assert.equal(shouldApplySecretPatch("•••"), false);
    assert.equal(shouldApplySecretPatch("new-secret-token"), true);
    assert.equal(shouldApplySecretPatch(""), false);
    assert.equal(shouldApplySecretPatch(undefined), false);
  });
});

describe("reminder due-window scan (Phase 12)", () => {
  const rows: ReminderScheduleRow[] = [
    { installmentNo: 1, dueDate: "2026-07-10", amountDue: 1000, status: "paid" },
    { installmentNo: 2, dueDate: "2026-07-18", amountDue: 1000, status: "due" },
    { installmentNo: 3, dueDate: "2026-07-25", amountDue: 1000, status: "due" },
    { installmentNo: 4, dueDate: "2026-08-01", amountDue: 1000, status: "due" },
  ];

  it("picks earliest unpaid non-rolled installment within 7-day window", () => {
    const picked = pickUpcomingInstallment(rows, "2026-07-17", "2026-07-24");
    assert.deepEqual(picked, {
      installmentNo: 2,
      dueDate: "2026-07-18",
      amountDue: 1000,
      status: "due",
    });
  });

  it("skips paid and rolled", () => {
    const mixed: ReminderScheduleRow[] = [
      { installmentNo: 1, dueDate: "2026-07-18", amountDue: 1, status: "paid" },
      { installmentNo: 2, dueDate: "2026-07-19", amountDue: 1, status: "rolled" },
      { installmentNo: 3, dueDate: "2026-07-20", amountDue: 1, status: "due" },
    ];
    const picked = pickUpcomingInstallment(mixed, "2026-07-17", "2026-07-24");
    assert.equal(picked?.installmentNo, 3);
  });

  it("returns null when nothing is in window", () => {
    assert.equal(
      pickUpcomingInstallment(rows, "2026-08-10", "2026-08-17"),
      null,
    );
  });
});
