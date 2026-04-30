import test from "node:test";
import assert from "node:assert/strict";

import { evaluateRefundPolicy } from "../src/domain/refund-policy.js";
import {
  FinancialStatus,
  FulfillmentStatus,
  RefundDecision,
  RefundReasonCode,
} from "../src/domain/refund-policy.types.js";
import type { RefundPolicyInput } from "../src/domain/refund-policy.types.js";

function makeInput(
  overrides: Partial<RefundPolicyInput> = {},
): RefundPolicyInput {
  return {
    orderId: "gid://shopify/Order/1",
    orderName: "#1001",
    orderCreatedAt: "2026-03-01T00:00:00.000Z",
    orderAgeDays: 10,
    orderTotalAmount: 48,
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

test("returns manual_review for partially refunded orders", () => {
  const result = evaluateRefundPolicy(
    makeInput({
      financialStatus: FinancialStatus.PartiallyRefunded,
    }),
  );

  assert.equal(result.decision, RefundDecision.ManualReview);
  assert.ok(
    result.reasons.some(
      (reason) => reason.code === RefundReasonCode.PartialRefundReviewRequired,
    ),
  );
});

test("returns manual_review for high-value orders when merchant policy configures a threshold", () => {
  const result = evaluateRefundPolicy(
    makeInput({
      orderTotalAmount: 750,
    }),
    {
      refundWindowDays: 30,
      cancelWindowDays: 30,
      highValueOrderThreshold: 500,
      alreadyFullyRefundedDecision: RefundDecision.Ineligible,
    },
  );

  assert.equal(result.decision, RefundDecision.ManualReview);
  assert.ok(
    result.reasons.some(
      (reason) => reason.code === RefundReasonCode.HighValueOrderReviewRequired,
    ),
  );
});

[
  FinancialStatus.Pending,
  FinancialStatus.PartiallyPaid,
  FinancialStatus.Voided,
  FinancialStatus.Unknown,
].forEach((financialStatus) => {
  test(`returns manual_review for ${financialStatus} orders`, () => {
    const result = evaluateRefundPolicy(
      makeInput({
        financialStatus,
      }),
    );

    assert.equal(result.decision, RefundDecision.ManualReview);
    assert.ok(
      result.reasons.some(
        (reason) =>
          reason.code === RefundReasonCode.FinancialStatusReviewRequired,
      ),
    );
  });
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

test("uses the configured fulfilled refund window for delivered orders", () => {
  const result = evaluateRefundPolicy(
    makeInput({
      orderAgeDays: 20,
    }),
    {
      refundWindowDays: 14,
      alreadyFullyRefundedDecision: RefundDecision.Ineligible,
    },
  );

  assert.equal(result.decision, RefundDecision.Ineligible);
  assert.ok(
    result.reasons.some(
      (reason) => reason.code === RefundReasonCode.OutsideRefundWindow,
    ),
  );
  assert.equal(result.evidence.effectiveRefundWindowDays, 14);
});

test("uses the configured unfulfilled cancellation window for pre-shipment orders", () => {
  const result = evaluateRefundPolicy(
    makeInput({
      orderAgeDays: 10,
      fulfillmentStatus: FulfillmentStatus.Unfulfilled,
      hasReturnableFulfillments: false,
    }),
    {
      refundWindowDays: 30,
      cancelWindowDays: 7,
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
  assert.equal(result.evidence.effectiveCancelWindowDays, 7);
});

test("uses the strictest matching category refund window for fulfilled orders", () => {
  const result = evaluateRefundPolicy(
    makeInput({
      orderAgeDays: 20,
      itemCategories: ["apparel", "accessories"],
    }),
    {
      refundWindowDays: 30,
      categoryWindowOverrides: [
        { category: "apparel", refundWindowDays: 14 },
        { category: "accessories", refundWindowDays: 21 },
      ],
      alreadyFullyRefundedDecision: RefundDecision.Ineligible,
    },
  );

  assert.equal(result.decision, RefundDecision.Ineligible);
  assert.equal(result.evidence.effectiveRefundWindowDays, 14);
  assert.deepEqual(result.evidence.matchedCategoryWindowCategories, [
    "apparel",
    "accessories",
  ]);
});

test("applies merchant exception rules when policy tags match a blocking refund case", () => {
  const result = evaluateRefundPolicy(
    makeInput({
      orderAgeDays: 45,
      policyTags: ["loyalty_recovery"],
    }),
    {
      refundWindowDays: 30,
      exceptionRules: [
        {
          tag: "loyalty_recovery",
          decision: RefundDecision.Eligible,
          message:
            "Merchant loyalty recovery rule allows a refund outside the standard window.",
        },
      ],
      alreadyFullyRefundedDecision: RefundDecision.Ineligible,
    },
  );

  assert.equal(result.decision, RefundDecision.Eligible);
  assert.ok(
    result.reasons.some(
      (reason) =>
        reason.code === RefundReasonCode.MerchantExceptionRuleApplied,
    ),
  );
  assert.equal(result.evidence.matchedExceptionRuleTag, "loyalty_recovery");
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
