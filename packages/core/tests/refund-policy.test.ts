import test from "node:test";
import assert from "node:assert/strict";

import { evaluateRefundPolicy } from "../src/domain/refund-policy.js";
import {
  FinancialStatus,
  FulfillmentStatus,
  ManualReviewKind,
  RefundDecision,
  RefundReasonCode,
} from "../src/domain/refund-policy.types.js";
import type {
  RefundContext,
  RefundContextLineItem,
} from "../src/domain/refund-policy.types.js";

type RefundContextOverrides = Partial<
  Omit<RefundContext["order"], "flags">
> & {
  flags?: Partial<RefundContext["order"]["flags"]>;
  lineItems?: RefundContextLineItem[];
  fulfillmentStatus?: FulfillmentStatus;
  hasReturnableFulfillment?: boolean;
  alreadyRefunded?: boolean;
  finalSale?: boolean;
  itemCategories?: string[];
};

function makeInput(
  overrides: RefundContextOverrides = {},
): RefundContext {
  const {
    fulfillmentStatus = FulfillmentStatus.Fulfilled,
    hasReturnableFulfillment = true,
    alreadyRefunded = false,
    finalSale = false,
    itemCategories,
    lineItems,
    flags = {},
    ...inputOverrides
  } = overrides;
  const order = {
    id: "gid://shopify/Order/1",
    name: "#1001",
    createdAt: "2026-03-01T00:00:00.000Z",
    ageDays: 10,
    totalAmount: 48,
    financialStatus: FinancialStatus.Paid,
    tags: [],
    flags: {
      fraudHold: false,
      manualReview: false,
      vipOverride: false,
      ...flags,
    },
    ...inputOverrides,
  };

  return {
    order,
    lineItems: lineItems ?? [
      {
        lineItemId: "gid://shopify/LineItem/1",
        title: "Default item",
        returnableQuantity: 1,
        category: itemCategories?.[0],
        fulfillmentStatus,
        hasReturnableFulfillment,
        alreadyRefunded,
        finalSale,
      },
    ],
  };
}

test("returns eligible for a straightforward refundable order", () => {
  const result = evaluateRefundPolicy(makeInput());

  assert.equal(result.decision, RefundDecision.Eligible);
  assert.equal(result.itemEvaluations.length, 1);
  assert.equal(result.itemEvaluations[0]?.decision, RefundDecision.Eligible);
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
      hasReturnableFulfillment: false,
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
      hasReturnableFulfillment: true,
    }),
  );

  assert.equal(result.decision, RefundDecision.ManualReview);
  assert.equal(result.manualReviewKind, ManualReviewKind.HardReason);
  assert.ok(
    result.reasons.some(
      (reason) =>
        reason.code === RefundReasonCode.PartialFulfillmentReviewRequired,
    ),
  );
});

test("does not block a refundable line item only because the order was partially refunded", () => {
  const result = evaluateRefundPolicy(
    makeInput({
      financialStatus: FinancialStatus.PartiallyRefunded,
    }),
  );

  assert.equal(result.decision, RefundDecision.Eligible);
  assert.equal(result.itemEvaluations[0]?.decision, RefundDecision.Eligible);
  assert.equal(
    result.itemEvaluations[0]?.evidence.evaluatedLineItem
      .effectiveFinancialStatus,
    FinancialStatus.Paid,
  );
});

test("returns manual_review for high-value orders when merchant policy configures a threshold", () => {
  const result = evaluateRefundPolicy(
    makeInput({
      totalAmount: 750,
    }),
    {
      refundWindowDays: 30,
      cancelWindowDays: 30,
      highValueOrderThreshold: 500,
      alreadyRefundedDecision: RefundDecision.Ineligible,
    },
  );

  assert.equal(result.decision, RefundDecision.ManualReview);
  assert.equal(result.manualReviewKind, ManualReviewKind.HardReason);
  assert.ok(
    result.reasons.some(
      (reason) => reason.code === RefundReasonCode.HighValueOrderReviewRequired,
    ),
  );
});

[
  FinancialStatus.PaymentPending,
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

test("returns ineligible for refund-pending orders", () => {
  const result = evaluateRefundPolicy(
    makeInput({
      financialStatus: FinancialStatus.RefundPending,
    }),
  );

  assert.equal(result.decision, RefundDecision.Ineligible);
  assert.ok(
    result.reasons.some(
      (reason) => reason.code === RefundReasonCode.RefundPending,
    ),
  );
  assert.equal(
    result.evidence.evaluatedOrder.effectiveFinancialStatus,
    FinancialStatus.RefundPending,
  );
});

test("returns manual_review when one line item is refund pending and siblings remain eligible", () => {
  const result = evaluateRefundPolicy(
    makeInput({
      lineItems: [
        {
          lineItemId: "gid://shopify/LineItem/1",
          title: "Pending Refund Shirt",
          returnableQuantity: 0,
          pendingRefundQuantity: 1,
          fulfillmentStatus: FulfillmentStatus.Fulfilled,
          hasReturnableFulfillment: false,
          alreadyRefunded: false,
          finalSale: false,
        },
        {
          lineItemId: "gid://shopify/LineItem/2",
          title: "Still Eligible Hat",
          returnableQuantity: 1,
          fulfillmentStatus: FulfillmentStatus.Fulfilled,
          hasReturnableFulfillment: true,
          alreadyRefunded: false,
          finalSale: false,
        },
      ],
    }),
  );

  assert.equal(result.decision, RefundDecision.ManualReview);
  assert.equal(result.manualReviewKind, ManualReviewKind.MixedItem);
  assert.ok(
    result.reasons.some(
      (reason) =>
        reason.code === RefundReasonCode.MixedItemEligibilityReviewRequired,
    ),
  );
  assert.ok(
    result.reasons.some(
      (reason) => reason.code === RefundReasonCode.RefundPending,
    ),
  );
  assert.equal(result.itemEvaluations[0]?.decision, RefundDecision.Ineligible);
  assert.equal(
    result.itemEvaluations[0]?.evidence.evaluatedLineItem
      .effectiveFinancialStatus,
    FinancialStatus.RefundPending,
  );
  assert.equal(
    result.itemEvaluations[0]?.evidence.evaluatedLineItem
      .pendingRefundQuantity,
    1,
  );
  assert.equal(result.itemEvaluations[1]?.decision, RefundDecision.Eligible);
});

test("keeps a line item eligible when pending refund quantity still has remaining returnable quantity", () => {
  const result = evaluateRefundPolicy(
    makeInput({
      lineItems: [
        {
          lineItemId: "gid://shopify/LineItem/1",
          title: "Partially Pending Shirt",
          returnableQuantity: 2,
          pendingRefundQuantity: 1,
          fulfillmentStatus: FulfillmentStatus.Fulfilled,
          hasReturnableFulfillment: true,
          alreadyRefunded: false,
          finalSale: false,
        },
      ],
    }),
  );

  assert.equal(result.decision, RefundDecision.Eligible);
  assert.equal(result.manualReviewKind, undefined);
  assert.equal(result.itemEvaluations[0]?.decision, RefundDecision.Eligible);
  assert.equal(
    result.itemEvaluations[0]?.evidence.evaluatedLineItem
      .effectiveFinancialStatus,
    FinancialStatus.Paid,
  );
  assert.equal(
    result.itemEvaluations[0]?.evidence.evaluatedLineItem.pendingRefundQuantity,
    1,
  );
  assert.equal(
    result.itemEvaluations[0]?.evidence.evaluatedLineItem.returnableQuantity,
    2,
  );
});

test("returns ineligible for unfulfilled final-sale orders by default", () => {
  const result = evaluateRefundPolicy(
    makeInput({
      fulfillmentStatus: FulfillmentStatus.Unfulfilled,
      hasReturnableFulfillment: false,
      finalSale: true,
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
      hasReturnableFulfillment: false,
      finalSale: true,
    }),
    {
      refundWindowDays: 30,
      finalSaleUnfulfilledDecision: RefundDecision.Eligible,
      alreadyRefundedDecision: RefundDecision.Ineligible,
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
      hasReturnableFulfillment: false,
      finalSale: true,
    }),
    {
      refundWindowDays: 30,
      finalSaleUnfulfilledDecision: RefundDecision.ManualReview,
      alreadyRefundedDecision: RefundDecision.Ineligible,
    },
  );

  assert.equal(result.decision, RefundDecision.ManualReview);
  assert.equal(result.manualReviewKind, ManualReviewKind.HardReason);
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
      ageDays: 45,
      fulfillmentStatus: FulfillmentStatus.Unfulfilled,
      hasReturnableFulfillment: false,
    }),
  );

  assert.equal(result.decision, RefundDecision.ManualReview);
  assert.equal(result.manualReviewKind, ManualReviewKind.HardReason);
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
      ageDays: 45,
      fulfillmentStatus: FulfillmentStatus.Unfulfilled,
      hasReturnableFulfillment: false,
    }),
    {
      refundWindowDays: 30,
      cancelWindowDays: 30,
      unfulfilledOutsideWindowDecision: RefundDecision.Eligible,
      alreadyRefundedDecision: RefundDecision.Ineligible,
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
      ageDays: 45,
      fulfillmentStatus: FulfillmentStatus.Unfulfilled,
      hasReturnableFulfillment: false,
    }),
    {
      refundWindowDays: 30,
      cancelWindowDays: 30,
      unfulfilledOutsideWindowDecision: RefundDecision.Ineligible,
      alreadyRefundedDecision: RefundDecision.Ineligible,
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
      ageDays: 45,
      fulfillmentStatus: FulfillmentStatus.Unfulfilled,
      hasReturnableFulfillment: false,
    }),
    {
      refundWindowDays: 30,
      cancelWindowDays: 30,
      unfulfilledOutsideWindowDecision: RefundDecision.ManualReview,
      alreadyRefundedDecision: RefundDecision.Ineligible,
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
      ageDays: 20,
    }),
    {
      refundWindowDays: 14,
      alreadyRefundedDecision: RefundDecision.Ineligible,
    },
  );

  assert.equal(result.decision, RefundDecision.Ineligible);
  assert.ok(
    result.reasons.some(
      (reason) => reason.code === RefundReasonCode.OutsideRefundWindow,
    ),
  );
  assert.equal(result.evidence.policyContext.effectiveRefundWindowDays, 14);
});

test("uses line item age override without changing order evidence age", () => {
  const result = evaluateRefundPolicy(
    makeInput({
      ageDays: 10,
      lineItems: [
        {
          lineItemId: "gid://shopify/LineItem/1",
          title: "Older return subject",
          returnableQuantity: 1,
          ageDaysOverride: 45,
          fulfillmentStatus: FulfillmentStatus.Fulfilled,
          hasReturnableFulfillment: true,
          alreadyRefunded: false,
          finalSale: false,
        },
      ],
    }),
    {
      refundWindowDays: 30,
      alreadyRefundedDecision: RefundDecision.Ineligible,
    },
  );

  assert.equal(result.decision, RefundDecision.Ineligible);
  assert.equal(result.evidence.order.ageDays, 10);
  assert.equal(
    result.itemEvaluations[0]?.evidence.evaluatedLineItem.ageDays,
    45,
  );
  assert.ok(
    result.reasons.some(
      (reason) => reason.code === RefundReasonCode.OutsideRefundWindow,
    ),
  );
});

test("uses the configured unfulfilled cancellation window for pre-shipment orders", () => {
  const result = evaluateRefundPolicy(
    makeInput({
      ageDays: 10,
      fulfillmentStatus: FulfillmentStatus.Unfulfilled,
      hasReturnableFulfillment: false,
    }),
    {
      refundWindowDays: 30,
      cancelWindowDays: 7,
      alreadyRefundedDecision: RefundDecision.Ineligible,
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
  assert.equal(result.evidence.policyContext.effectiveCancelWindowDays, 7);
});

test("uses the strictest matching category refund window for fulfilled orders", () => {
  const result = evaluateRefundPolicy(
    makeInput({
      ageDays: 20,
      lineItems: [
        {
          lineItemId: "gid://shopify/LineItem/1",
          title: "Dress",
          returnableQuantity: 1,
          category: "apparel",
          fulfillmentStatus: FulfillmentStatus.Fulfilled,
          hasReturnableFulfillment: true,
          alreadyRefunded: false,
          finalSale: false,
        },
        {
          lineItemId: "gid://shopify/LineItem/2",
          title: "Phone Case",
          returnableQuantity: 1,
          category: "accessories",
          fulfillmentStatus: FulfillmentStatus.Fulfilled,
          hasReturnableFulfillment: true,
          alreadyRefunded: false,
          finalSale: false,
        },
      ],
    }),
    {
      refundWindowDays: 30,
      categoryWindowOverrides: [
        { category: "apparel", refundWindowDays: 14 },
        { category: "accessories", refundWindowDays: 21 },
      ],
      alreadyRefundedDecision: RefundDecision.Ineligible,
    },
  );

  assert.equal(result.decision, RefundDecision.ManualReview);
  assert.equal(result.evidence.policyContext.effectiveRefundWindowDays, 14);
  assert.deepEqual(result.evidence.policyContext.matchedCategoryWindowCategories, [
    "apparel",
    "accessories",
  ]);
});

test("throws when refund policy input has no line items", () => {
  assert.throws(
    () =>
      evaluateRefundPolicy({
        ...makeInput(),
        lineItems: [],
      }),
    /requires at least one line item/,
  );
});

test("applies merchant exception rules when order tags match a blocking refund case", () => {
  const result = evaluateRefundPolicy(
    makeInput({
      ageDays: 45,
      tags: ["loyalty_recovery"],
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
      alreadyRefundedDecision: RefundDecision.Ineligible,
    },
  );

  assert.equal(result.decision, RefundDecision.Eligible);
  assert.ok(
    result.reasons.some(
      (reason) =>
        reason.code === RefundReasonCode.MerchantExceptionRuleApplied,
    ),
  );
  assert.equal(result.evidence.policyContext.matchedExceptionRuleTag, "loyalty_recovery");
});

test("applies merchant exception rules after returnable fulfillment blockers are collected", () => {
  const result = evaluateRefundPolicy(
    makeInput({
      hasReturnableFulfillment: false,
      tags: ["loyalty_recovery"],
    }),
    {
      refundWindowDays: 30,
      cancelWindowDays: 30,
      exceptionRules: [
        {
          tag: "loyalty_recovery",
          decision: RefundDecision.Eligible,
          message:
            "Merchant loyalty recovery rule allows a refund without returnable fulfillments.",
        },
      ],
      alreadyRefundedDecision: RefundDecision.Ineligible,
    },
  );

  assert.equal(result.decision, RefundDecision.Eligible);
  assert.ok(
    result.reasons.some(
      (reason) =>
        reason.code === RefundReasonCode.MerchantExceptionRuleApplied,
    ),
  );
  assert.equal(result.evidence.policyContext.matchedExceptionRuleTag, "loyalty_recovery");
});

test("returns ineligible when order is outside the refund window", () => {
  const result = evaluateRefundPolicy(makeInput({ ageDays: 45 }));

  assert.equal(result.decision, RefundDecision.Ineligible);
  assert.ok(
    result.reasons.some(
      (reason) => reason.code === RefundReasonCode.OutsideRefundWindow,
    ),
  );
});

test("returns ineligible when the line item is final sale", () => {
  const result = evaluateRefundPolicy(makeInput({ finalSale: true }));

  assert.equal(result.decision, RefundDecision.Ineligible);
  assert.ok(
    result.reasons.some(
      (reason) =>
        reason.code === RefundReasonCode.FinalSaleUnavailableForRefund,
    ),
  );
});

test("returns ineligible when the line item was already refunded", () => {
  const result = evaluateRefundPolicy(
    makeInput({ alreadyRefunded: true }),
  );

  assert.equal(result.decision, RefundDecision.Ineligible);
  assert.ok(
    result.reasons.some(
      (reason) => reason.code === RefundReasonCode.AlreadyFullyRefunded,
    ),
  );
});

test("returns manual_review for refunded line items when merchant config allows it", () => {
  const result = evaluateRefundPolicy(
    makeInput({ alreadyRefunded: true }),
    {
      refundWindowDays: 30,
      alreadyRefundedDecision: RefundDecision.ManualReview,
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
      ageDays: 60,
      hasReturnableFulfillment: false,
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

test("evaluates line items independently and rolls mixed item eligibility up to manual_review", () => {
  const result = evaluateRefundPolicy(
    makeInput({
      ageDays: 20,
      lineItems: [
        {
          lineItemId: "gid://shopify/LineItem/1",
          title: "Dress",
          returnableQuantity: 1,
          category: "apparel",
          fulfillmentStatus: FulfillmentStatus.Fulfilled,
          hasReturnableFulfillment: true,
          alreadyRefunded: false,
          finalSale: false,
        },
        {
          lineItemId: "gid://shopify/LineItem/2",
          title: "Phone Case",
          returnableQuantity: 1,
          category: "accessories",
          fulfillmentStatus: FulfillmentStatus.Fulfilled,
          hasReturnableFulfillment: true,
          alreadyRefunded: false,
          finalSale: false,
        },
      ],
    }),
    {
      refundWindowDays: 30,
      cancelWindowDays: 30,
      categoryWindowOverrides: [
        { category: "apparel", refundWindowDays: 14 },
      ],
      alreadyRefundedDecision: RefundDecision.Ineligible,
    },
  );

  assert.equal(result.decision, RefundDecision.ManualReview);
  assert.ok(
    result.reasons.some(
      (reason) =>
        reason.code === RefundReasonCode.MixedItemEligibilityReviewRequired,
    ),
  );
  assert.equal(result.itemEvaluations?.[0]?.decision, RefundDecision.Ineligible);
  assert.equal(result.itemEvaluations?.[1]?.decision, RefundDecision.Eligible);
  assert.equal(
    result.itemEvaluations?.[0]?.evidence.policyContext.effectiveRefundWindowDays,
    14,
  );
  assert.equal(
    result.itemEvaluations?.[1]?.evidence.policyContext.effectiveRefundWindowDays,
    30,
  );
  assert.deepEqual(result.evidence.evaluatedOrder.itemCategories, [
    "apparel",
    "accessories",
  ]);
  assert.equal(result.evidence.policyContext.effectiveRefundWindowDays, 14);
});

test("evaluates final-sale and refundable line items separately", () => {
  const result = evaluateRefundPolicy(
    makeInput({
      lineItems: [
        {
          lineItemId: "gid://shopify/LineItem/1",
          title: "Clearance Socks",
          returnableQuantity: 1,
          category: "apparel",
          fulfillmentStatus: FulfillmentStatus.Fulfilled,
          hasReturnableFulfillment: true,
          alreadyRefunded: false,
          finalSale: true,
        },
        {
          lineItemId: "gid://shopify/LineItem/2",
          title: "Phone Case",
          returnableQuantity: 1,
          category: "accessories",
          fulfillmentStatus: FulfillmentStatus.Fulfilled,
          hasReturnableFulfillment: true,
          alreadyRefunded: false,
          finalSale: false,
        },
      ],
    }),
  );

  assert.equal(result.decision, RefundDecision.ManualReview);
  assert.equal(result.manualReviewKind, ManualReviewKind.MixedItem);
  assert.equal(result.itemEvaluations?.[0]?.decision, RefundDecision.Ineligible);
  assert.equal(result.itemEvaluations?.[0]?.evidence.evaluatedLineItem.finalSale, true);
  assert.ok(
    result.itemEvaluations?.[0]?.reasons.some(
      (reason) =>
        reason.code === RefundReasonCode.FinalSaleUnavailableForRefund,
    ),
  );
  assert.equal(result.itemEvaluations?.[1]?.decision, RefundDecision.Eligible);
  assert.equal(result.itemEvaluations?.[1]?.evidence.evaluatedLineItem.finalSale, false);
});

test("evaluates already-refunded line items without blocking refundable siblings", () => {
  const result = evaluateRefundPolicy(
    makeInput({
      financialStatus: FinancialStatus.PartiallyRefunded,
      lineItems: [
        {
          lineItemId: "gid://shopify/LineItem/1",
          title: "Already Refunded Shirt",
          returnableQuantity: 1,
          category: "apparel",
          fulfillmentStatus: FulfillmentStatus.Fulfilled,
          hasReturnableFulfillment: false,
          alreadyRefunded: true,
          finalSale: false,
        },
        {
          lineItemId: "gid://shopify/LineItem/2",
          title: "Returnable Hat",
          returnableQuantity: 1,
          category: "accessories",
          fulfillmentStatus: FulfillmentStatus.Fulfilled,
          hasReturnableFulfillment: true,
          alreadyRefunded: false,
          finalSale: false,
        },
      ],
    }),
  );

  assert.equal(result.decision, RefundDecision.ManualReview);
  assert.equal(result.manualReviewKind, ManualReviewKind.MixedItem);
  assert.equal(result.itemEvaluations?.[0]?.decision, RefundDecision.Ineligible);
  assert.equal(
    result.itemEvaluations?.[0]?.evidence.evaluatedLineItem
      .lineItemAlreadyRefunded,
    true,
  );
  assert.ok(
    result.itemEvaluations?.[0]?.reasons.some(
      (reason) => reason.code === RefundReasonCode.AlreadyFullyRefunded,
    ),
  );
  assert.equal(result.itemEvaluations?.[1]?.decision, RefundDecision.Eligible);
  assert.equal(
    result.itemEvaluations?.[1]?.evidence.evaluatedLineItem
      .lineItemAlreadyRefunded,
    false,
  );
});
