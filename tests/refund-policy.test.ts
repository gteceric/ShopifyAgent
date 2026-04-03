import test from "node:test";
import assert from "node:assert/strict";

import { evaluateRefundPolicy } from "../src/policy/refund-policy.js";
import {
  FinancialStatus,
  FulfillmentStatus,
  RefundDecision,
  RefundReasonCode,
} from "../src/policy/refund-policy.types.js";
import type { RefundPolicyInput } from "../src/policy/refund-policy.types.js";

function makeInput(
  overrides: Partial<RefundPolicyInput> = {},
): RefundPolicyInput {
  return {
    orderId: "gid://shopify/Order/1",
    orderName: "#1001",
    orderCreatedAt: "2026-03-01T00:00:00.000Z",
    orderAgeDays: 10,
    financialStatus: FinancialStatus.Paid,
    fulfillmentStatus: FulfillmentStatus.Fulfilled,
    hasReturnableFulfillments: true,
    alreadyFullyRefunded: false,
    allItemsFinalSale: false,
    flags: {},
    ...overrides,
  };
}

test("returns eligible for a straightforward refundable order", () => {
  const result = evaluateRefundPolicy(makeInput());

  assert.equal(result.decision, RefundDecision.Eligible);
  assert.equal(result.reasons[0]?.code, RefundReasonCode.WithinRefundWindow);
  assert.match(
    result.reasons[0]?.message ?? "",
    /within the 30-day refund window/i,
  );
});

test("returns eligible for paid unfulfilled orders that can be canceled before shipment", () => {
  const result = evaluateRefundPolicy(
    makeInput({
      fulfillmentStatus: FulfillmentStatus.Unfulfilled,
      hasReturnableFulfillments: false,
    }),
  );

  assert.equal(result.decision, RefundDecision.Eligible);
  assert.ok(
    result.reasons.some(
      (reason) => reason.code === RefundReasonCode.WithinCancelWindow,
    ),
  );
  assert.ok(
    !result.reasons.some(
      (reason) =>
        reason.code === RefundReasonCode.ReturnableFulfillmentsUnavailable,
    ),
  );
});

test("returns manual_review for partially fulfilled orders", () => {
  const result = evaluateRefundPolicy(
    makeInput({
      fulfillmentStatus: FulfillmentStatus.Partial,
      hasReturnableFulfillments: true,
    }),
  );

  assert.equal(result.decision, RefundDecision.ManualReview);
  assert.ok(
    result.reasons.some(
      (reason) =>
        reason.code === RefundReasonCode.PartialFulfillmentReviewRequired,
    ),
  );
});

test("returns ineligible for unfulfilled final-sale orders by default", () => {
  const result = evaluateRefundPolicy(
    makeInput({
      fulfillmentStatus: FulfillmentStatus.Unfulfilled,
      hasReturnableFulfillments: false,
      allItemsFinalSale: true,
    }),
  );

  assert.equal(result.decision, RefundDecision.Ineligible);
  assert.ok(
    result.reasons.some(
      (reason) => reason.code === RefundReasonCode.FinalSaleUnavailableForRefund,
    ),
  );
});

test("returns eligible for unfulfilled final-sale orders when merchant policy allows it", () => {
  const result = evaluateRefundPolicy(
    makeInput({
      fulfillmentStatus: FulfillmentStatus.Unfulfilled,
      hasReturnableFulfillments: false,
      allItemsFinalSale: true,
    }),
    {
      refundWindowDays: 30,
      finalSaleUnfulfilledDecision: RefundDecision.Eligible,
      alreadyFullyRefundedDecision: RefundDecision.Ineligible,
    },
  );

  assert.equal(result.decision, RefundDecision.Eligible);
  assert.ok(
    result.reasons.some(
      (reason) => reason.code === RefundReasonCode.FinalSaleUnfulfilledAllowed,
    ),
  );
});

test("returns manual_review for unfulfilled final-sale orders when merchant policy forces it", () => {
  const result = evaluateRefundPolicy(
    makeInput({
      fulfillmentStatus: FulfillmentStatus.Unfulfilled,
      hasReturnableFulfillments: false,
      allItemsFinalSale: true,
    }),
    {
      refundWindowDays: 30,
      finalSaleUnfulfilledDecision: RefundDecision.ManualReview,
      alreadyFullyRefundedDecision: RefundDecision.Ineligible,
    },
  );

  assert.equal(result.decision, RefundDecision.ManualReview);
  assert.ok(
    result.reasons.some(
      (reason) =>
        reason.code === RefundReasonCode.PreFulfillmentFinalSaleReviewRequired,
    ),
  );
});

test("returns manual_review for stale unfulfilled orders outside the cancellation window", () => {
  const result = evaluateRefundPolicy(
    makeInput({
      orderAgeDays: 45,
      fulfillmentStatus: FulfillmentStatus.Unfulfilled,
      hasReturnableFulfillments: false,
    }),
  );

  assert.equal(result.decision, RefundDecision.ManualReview);
  assert.ok(
    result.reasons.some(
      (reason) =>
        reason.code ===
        RefundReasonCode.PreFulfillmentCancellationReviewRequired,
    ),
  );
  assert.ok(
    !result.reasons.some(
      (reason) => reason.code === RefundReasonCode.OutsideRefundWindow,
    ),
  );
});

test("returns eligible for stale unfulfilled orders when merchant policy allows it", () => {
  const result = evaluateRefundPolicy(
    makeInput({
      orderAgeDays: 45,
      fulfillmentStatus: FulfillmentStatus.Unfulfilled,
      hasReturnableFulfillments: false,
    }),
    {
      refundWindowDays: 30,
      cancelWindowDays: 30,
      unfulfilledOutsideWindowDecision: RefundDecision.Eligible,
      alreadyFullyRefundedDecision: RefundDecision.Ineligible,
    },
  );

  assert.equal(result.decision, RefundDecision.Eligible);
  assert.ok(
    result.reasons.some(
      (reason) =>
        reason.code === RefundReasonCode.UnfulfilledOutsideWindowAllowed,
    ),
  );
  assert.ok(
    result.reasons.some(
      (reason) => reason.code === RefundReasonCode.OutsideCancelWindow,
    ),
  );
});

test("returns ineligible for stale unfulfilled orders when merchant policy forces it", () => {
  const result = evaluateRefundPolicy(
    makeInput({
      orderAgeDays: 45,
      fulfillmentStatus: FulfillmentStatus.Unfulfilled,
      hasReturnableFulfillments: false,
    }),
    {
      refundWindowDays: 30,
      cancelWindowDays: 30,
      unfulfilledOutsideWindowDecision: RefundDecision.Ineligible,
      alreadyFullyRefundedDecision: RefundDecision.Ineligible,
    },
  );

  assert.equal(result.decision, RefundDecision.Ineligible);
  assert.ok(
    result.reasons.some(
      (reason) => reason.code === RefundReasonCode.OutsideCancelWindow,
    ),
  );
});

test("returns manual_review for stale unfulfilled orders when merchant policy forces it", () => {
  const result = evaluateRefundPolicy(
    makeInput({
      orderAgeDays: 45,
      fulfillmentStatus: FulfillmentStatus.Unfulfilled,
      hasReturnableFulfillments: false,
    }),
    {
      refundWindowDays: 30,
      cancelWindowDays: 30,
      unfulfilledOutsideWindowDecision: RefundDecision.ManualReview,
      alreadyFullyRefundedDecision: RefundDecision.Ineligible,
    },
  );

  assert.equal(result.decision, RefundDecision.ManualReview);
  assert.ok(
    result.reasons.some(
      (reason) =>
        reason.code ===
        RefundReasonCode.PreFulfillmentCancellationReviewRequired,
    ),
  );
});

test("returns ineligible when order is outside the refund window", () => {
  const result = evaluateRefundPolicy(makeInput({ orderAgeDays: 45 }));

  assert.equal(result.decision, RefundDecision.Ineligible);
  assert.ok(
    result.reasons.some(
      (reason) => reason.code === RefundReasonCode.OutsideRefundWindow,
    ),
  );
});

test("returns ineligible when all items are final sale", () => {
  const result = evaluateRefundPolicy(makeInput({ allItemsFinalSale: true }));

  assert.equal(result.decision, RefundDecision.Ineligible);
  assert.ok(
    result.reasons.some(
      (reason) =>
        reason.code === RefundReasonCode.FinalSaleUnavailableForRefund,
    ),
  );
});

test("returns ineligible when order was already fully refunded", () => {
  const result = evaluateRefundPolicy(
    makeInput({ alreadyFullyRefunded: true }),
  );

  assert.equal(result.decision, RefundDecision.Ineligible);
  assert.ok(
    result.reasons.some(
      (reason) => reason.code === RefundReasonCode.AlreadyFullyRefunded,
    ),
  );
});

test("returns manual_review for refunded orders when merchant config allows it", () => {
  const result = evaluateRefundPolicy(
    makeInput({ alreadyFullyRefunded: true }),
    {
      refundWindowDays: 30,
      alreadyFullyRefundedDecision: RefundDecision.ManualReview,
    },
  );

  assert.equal(result.decision, RefundDecision.ManualReview);
  assert.ok(
    result.reasons.some(
      (reason) => reason.code === RefundReasonCode.AlreadyFullyRefunded,
    ),
  );
});

test("returns manual_review when fraud or review flags are present", () => {
  const result = evaluateRefundPolicy(
    makeInput({ flags: { fraudHold: true } }),
  );

  assert.equal(result.decision, RefundDecision.ManualReview);
  assert.ok(
    result.reasons.some(
      (reason) => reason.code === RefundReasonCode.ManualReviewRequired,
    ),
  );
});

test("returns eligible with an explicit override reason for VIP exceptions", () => {
  const result = evaluateRefundPolicy(
    makeInput({
      orderAgeDays: 60,
      hasReturnableFulfillments: false,
      flags: { vipOverride: true },
    }),
  );

  assert.equal(result.decision, RefundDecision.Eligible);
  assert.ok(
    result.reasons.some(
      (reason) => reason.code === RefundReasonCode.VipOverrideApplied,
    ),
  );
  assert.ok(
    !result.reasons.some(
      (reason) => reason.code === RefundReasonCode.WithinRefundWindow,
    ),
  );
});
