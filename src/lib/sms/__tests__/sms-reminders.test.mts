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
    { installmentNo: 1, dueDate: "2026-07-10", amountDue: 1000, discountAmount: 0, status: "paid" },
    { installmentNo: 2, dueDate: "2026-07-18", amountDue: 1000, discountAmount: 0, status: "due" },
    { installmentNo: 3, dueDate: "2026-07-25", amountDue: 1000, discountAmount: 0, status: "due" },
    { installmentNo: 4, dueDate: "2026-08-01", amountDue: 1000, discountAmount: 0, status: "due" },
  ];

  it("picks earliest unpaid non-rolled installment within 7-day window", () => {
    const picked = pickUpcomingInstallment(rows, "2026-07-17", "2026-07-24");
    assert.deepEqual(picked, {
      installmentNo: 2,
      dueDate: "2026-07-18",
      amountDue: 1000,
      discountAmount: 0,
      status: "due",
    });
  });

  it("skips paid and rolled", () => {
    const mixed: ReminderScheduleRow[] = [
      { installmentNo: 1, dueDate: "2026-07-18", amountDue: 1, discountAmount: 0, status: "paid" },
      { installmentNo: 2, dueDate: "2026-07-19", amountDue: 1, discountAmount: 0, status: "rolled" },
      { installmentNo: 3, dueDate: "2026-07-20", amountDue: 1, discountAmount: 0, status: "due" },
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

  it("carries discountAmount through on the picked installment, so the reminder text can be net (fixed 2026-08-31)", () => {
    const discounted: ReminderScheduleRow[] = [
      { installmentNo: 1, dueDate: "2026-07-18", amountDue: 1080, discountAmount: 1080, status: "due" },
    ];
    const picked = pickUpcomingInstallment(discounted, "2026-07-17", "2026-07-24");
    assert.equal(picked?.discountAmount, 1080);
  });

  it("never picks a $0 principal placeholder row (Quarterly/Two-Monthly Special) — a real borrower must never get 'your payment of PHP 0.00 is due'", () => {
    // Regression for a live bug class (AN300445, 2026-09-04): Special
    // schedules persist a $0 principal row alongside every non-final
    // period's real interest row, same due date.
    const specialRows: ReminderScheduleRow[] = [
      { installmentNo: 1, dueDate: "2026-07-18", amountDue: 0, discountAmount: 0, status: "due" },
      { installmentNo: 2, dueDate: "2026-07-20", amountDue: 11781, discountAmount: 0, status: "due" },
    ];
    const picked = pickUpcomingInstallment(specialRows, "2026-07-17", "2026-07-24");
    assert.equal(picked?.installmentNo, 2);
    assert.equal(picked?.amountDue, 11781);
  });

  it("returns null when every row in the window is a $0 placeholder", () => {
    const allZero: ReminderScheduleRow[] = [
      { installmentNo: 1, dueDate: "2026-07-18", amountDue: 0, discountAmount: 0, status: "due" },
    ];
    assert.equal(pickUpcomingInstallment(allZero, "2026-07-17", "2026-07-24"), null);
  });
});
