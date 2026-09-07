import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPaymentReceiptContext,
  type PaymentReceiptInput,
} from "../payment-receipt";

const BASE: PaymentReceiptInput = {
  borrowerName: "Carlos Aquino",
  address: "123 Rizal St, Makati",
  loanAccountNo: "AN300007",
  paymentAmount: 8250,
  paymentDate: "09/02/2026",
  referenceNo: "3546",
  interestDiscountAmount: 0,
  interestDiscountedInstallmentNos: [],
  penaltyDiscountAmount: 0,
  penaltyDiscountedInstallmentNos: [],
  discountReason: null,
  todayDate: "09/04/2026",
};

test("an ordinary payment with no discount shows hasDiscount = false", () => {
  const ctx = buildPaymentReceiptContext(BASE);
  assert.equal(ctx.hasDiscount, false);
  assert.equal(ctx.hasInterestDiscount, false);
  assert.equal(ctx.hasPenaltyDiscount, false);
  assert.equal(ctx.paymentAmount, "8,250.00");
});

test("an interest-only discount sets hasDiscount and hasInterestDiscount, not hasPenaltyDiscount", () => {
  const ctx = buildPaymentReceiptContext({
    ...BASE,
    interestDiscountAmount: 300,
    interestDiscountedInstallmentNos: [4, 5],
  });
  assert.equal(ctx.hasDiscount, true);
  assert.equal(ctx.hasInterestDiscount, true);
  assert.equal(ctx.hasPenaltyDiscount, false);
  assert.equal(ctx.interestDiscountAmount, "300.00");
  assert.equal(ctx.interestDiscountedInstallments, "4, 5");
  assert.equal(ctx.totalDiscountAmount, "300.00");
});

test("a penalty-only discount sets hasDiscount and hasPenaltyDiscount, not hasInterestDiscount", () => {
  const ctx = buildPaymentReceiptContext({
    ...BASE,
    penaltyDiscountAmount: 150,
    penaltyDiscountedInstallmentNos: [1],
  });
  assert.equal(ctx.hasDiscount, true);
  assert.equal(ctx.hasInterestDiscount, false);
  assert.equal(ctx.hasPenaltyDiscount, true);
  assert.equal(ctx.penaltyDiscountAmount, "150.00");
  assert.equal(ctx.penaltyDiscountedInstallments, "1");
});

test("both discounts in the same receipt total independently (Rule 1)", () => {
  const ctx = buildPaymentReceiptContext({
    ...BASE,
    interestDiscountAmount: 300,
    interestDiscountedInstallmentNos: [4],
    penaltyDiscountAmount: 150,
    penaltyDiscountedInstallmentNos: [1],
    discountReason: "Approved by Sir Rene, 09/03",
  });
  assert.equal(ctx.hasInterestDiscount, true);
  assert.equal(ctx.hasPenaltyDiscount, true);
  assert.equal(ctx.totalDiscountAmount, "450.00");
  assert.equal(ctx.discountReason, "Approved by Sir Rene, 09/03");
});

test("installment numbers are sorted for display regardless of input order", () => {
  const ctx = buildPaymentReceiptContext({
    ...BASE,
    interestDiscountAmount: 600,
    interestDiscountedInstallmentNos: [7, 4, 5],
  });
  assert.equal(ctx.interestDiscountedInstallments, "4, 5, 7");
});

test("a null discountReason renders as an empty string, not the literal null", () => {
  const ctx = buildPaymentReceiptContext(BASE);
  assert.equal(ctx.discountReason, "");
});
