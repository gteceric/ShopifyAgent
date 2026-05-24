import assert from "node:assert/strict";
import test from "node:test";

import {
  FinancialStatus,
  FulfillmentStatus,
  ManualReviewKind,
  RecommendedRefundAction,
  RefundDecision,
  RefundReasonCode,
  type CheckRefundEligibilityResult,
} from "@shopify-agent/core";
import {
  applyRefundEvaluationToOrder,
  loadMerchantRefundPolicyConfig,
} from "../app/dashboard-order-evaluation.js";
import type { DashboardOrder } from "../app/mock-orders.js";

const order = {
  id: "gid://shopify/Order/910000000050",
  name: "#3050",
  createdAt: "2026-03-01T00:00:00.000Z",
  ageDays: 20,
  totalAmount: 72,
  financialStatus: FinancialStatus.Paid,
  tags: [],
  flags: {
    fraudHold: false,
    manualReview: false,
    vipOverride: false,
  },
};

function makeDashboardOrder(): DashboardOrder {
  return {
    base: {
      id: order.id,
      orderName: order.name,
      customerName: "Test Customer",
      createdAtLabel: "Mar 1, 2026",
      orderAgeDays: 20,
      orderTotalLabel: "$72.00",
      financialStatus: "Paid",
      fulfillmentStatus: "Fulfilled",
    },
    // Display fields start empty here because applyRefundEvaluationToOrder
    // fills them from the live refund evaluation result.
    refundEvaluation: {
      decision: RefundDecision.Eligible,
      reasonSummary: "",
      recommendedNextAction: "",
      lastUpdatedLabel: "",
      policyWindowLabel: "",
      reasonDetails: [],
      evidence: [],
      timeline: [],
    },
  };
}

function makeRefundResult(): CheckRefundEligibilityResult {
  return {
    orderId: order.id,
    exceptionAvailable: false,
    escalationRequired: true,
    recommendedNextAction: RecommendedRefundAction.ManualReview,
    policyResult: {
      decision: RefundDecision.ManualReview,
      manualReviewKind: ManualReviewKind.MixedItem,
      reasons: [
        {
          code: RefundReasonCode.MixedItemEligibilityReviewRequired,
          message:
            "Refund request has mixed item eligibility, so a human should review the partial refund path.",
        },
      ],
      evidence: {
        order,
        policyContext: {
          refundWindowDays: 30,
          effectiveRefundWindowDays: 14,
          cancelWindowDays: 30,
          effectiveCancelWindowDays: 30,
          matchedCategoryWindowCategories: ["apparel"],
        },
        evaluatedOrder: {
          effectiveFinancialStatus: FinancialStatus.Paid,
          fulfillmentStatus: FulfillmentStatus.Fulfilled,
          hasAnyReturnableFulfillment: true,
          allLineItemsRefunded: false,
          allLineItemsFinalSale: false,
          itemCategories: ["apparel", "accessories"],
        },
      },
      itemEvaluations: [
        {
          decision: RefundDecision.Ineligible,
          reasons: [
            {
              code: RefundReasonCode.OutsideRefundWindow,
              message: "Refund subject is outside the 14-day refund window.",
            },
          ],
          evidence: {
            order,
            policyContext: {
              refundWindowDays: 30,
              effectiveRefundWindowDays: 14,
              cancelWindowDays: 30,
              effectiveCancelWindowDays: 30,
              matchedCategoryWindowCategories: ["apparel"],
            },
            evaluatedLineItem: {
              lineItemId: "gid://shopify/LineItem/1",
              title: "Dress",
              sku: "DRESS-RED-4",
              variantTitle: "Red / Size 4",
              variantOptions: [
                { name: "Color", value: "Red" },
                { name: "Size", value: "4" },
              ],
              imageUrl: "https://cdn.example.test/dress.jpg",
              imageAltText: "Red dress",
              unitPrice: {
                amount: "72.00",
                currencyCode: "USD",
              },
              returnableQuantity: 1,
              ageDays: 20,
              effectiveFinancialStatus: FinancialStatus.Paid,
              fulfillmentStatus: FulfillmentStatus.Fulfilled,
              hasReturnableFulfillment: true,
              lineItemAlreadyRefunded: false,
              finalSale: false,
              category: "apparel",
            },
          },
        },
        {
          decision: RefundDecision.Eligible,
          reasons: [
            {
              code: RefundReasonCode.WithinRefundWindow,
              message: "Refund subject is within the 30-day refund window.",
            },
          ],
          evidence: {
            order,
            policyContext: {
              refundWindowDays: 30,
              effectiveRefundWindowDays: 30,
              cancelWindowDays: 30,
              effectiveCancelWindowDays: 30,
              matchedCategoryWindowCategories: [],
            },
            evaluatedLineItem: {
              lineItemId: "gid://shopify/LineItem/2",
              title: "Phone Case",
              returnableQuantity: 2,
              ageDays: 20,
              effectiveFinancialStatus: FinancialStatus.Paid,
              fulfillmentStatus: FulfillmentStatus.Fulfilled,
              hasReturnableFulfillment: true,
              lineItemAlreadyRefunded: false,
              finalSale: false,
              category: "accessories",
            },
          },
        },
      ],
    },
  };
}

test("maps item evaluations into dashboard item view models", () => {
  const dashboardOrder = applyRefundEvaluationToOrder(
    makeDashboardOrder(),
    makeRefundResult(),
  );

  assert.equal(
    dashboardOrder.refundEvaluation.reasonSummary,
    "Mixed item eligibility requires human review.",
  );
  assert.equal(
    dashboardOrder.refundEvaluation.recommendedNextAction,
    "Review item-level eligibility before promising an outcome.",
  );
  assert.equal(
    dashboardOrder.refundEvaluation.policyWindowLabel,
    "14-day refund window",
  );
  assert.deepEqual(dashboardOrder.refundEvaluation.evidence.slice(0, 2), [
    { label: "Order Age", value: "20 days" },
    { label: "Refund Window", value: "14 days" },
  ]);
  assert.deepEqual(dashboardOrder.refundEvaluation.itemEvaluations, [
    {
      lineItemId: "gid://shopify/LineItem/1",
      title: "Dress",
      sku: "DRESS-RED-4",
      variantTitle: "Red / Size 4",
      variantOptions: [
        { name: "Color", value: "Red" },
        { name: "Size", value: "4" },
      ],
      imageUrl: "https://cdn.example.test/dress.jpg",
      imageAltText: "Red dress",
      unitPriceLabel: "$72.00",
      decision: RefundDecision.Ineligible,
      returnableQuantity: 1,
      reasonSummary: "Refund subject is outside the 14-day refund window.",
      evidence: [
        { label: "Fulfillment", value: "Fulfilled" },
        { label: "Financial Status", value: "Paid" },
        { label: "Returnable Qty", value: "1" },
        { label: "Returnable Fulfillment", value: "Yes" },
        { label: "Already Refunded", value: "No" },
        { label: "Final Sale", value: "No" },
        { label: "Age", value: "20 days" },
        { label: "Category", value: "apparel" },
      ],
    },
    {
      lineItemId: "gid://shopify/LineItem/2",
      title: "Phone Case",
      decision: RefundDecision.Eligible,
      returnableQuantity: 2,
      reasonSummary: "Refund subject is within the 30-day refund window.",
      evidence: [
        { label: "Fulfillment", value: "Fulfilled" },
        { label: "Financial Status", value: "Paid" },
        { label: "Returnable Qty", value: "2" },
        { label: "Returnable Fulfillment", value: "Yes" },
        { label: "Already Refunded", value: "No" },
        { label: "Final Sale", value: "No" },
        { label: "Age", value: "20 days" },
        { label: "Category", value: "accessories" },
      ],
    },
  ]);
});

test("summarizes refund-pending decisions distinctly from refunded orders", () => {
  const refundResult = makeRefundResult();
  refundResult.recommendedNextAction = RecommendedRefundAction.RefundPending;
  refundResult.policyResult.decision = RefundDecision.Ineligible;
  refundResult.policyResult.reasons = [
    {
      code: RefundReasonCode.RefundPending,
      message: "Refund has already been initiated in Shopify and is pending.",
    },
  ];
  refundResult.policyResult.evidence.evaluatedOrder.effectiveFinancialStatus =
    FinancialStatus.RefundPending;

  const dashboardOrder = applyRefundEvaluationToOrder(
    makeDashboardOrder(),
    refundResult,
  );

  assert.equal(
    dashboardOrder.refundEvaluation.reasonSummary,
    "Refund is already pending in Shopify.",
  );
  assert.equal(
    dashboardOrder.refundEvaluation.recommendedNextAction,
    "Refund pending in Shopify. Do not create another refund yet.",
  );
  assert.deepEqual(
    dashboardOrder.refundEvaluation.evidence.find(
      (item) => item.label === "Financial Status",
    ),
    { label: "Financial Status", value: "Refund Pending" },
  );
});

test("summarizes mixed pending and eligible line items as manual review", () => {
  const refundResult = makeRefundResult();
  refundResult.policyResult.reasons = [
    {
      code: RefundReasonCode.MixedItemEligibilityReviewRequired,
      message:
        "Refund request has mixed item eligibility, so a human should review the partial refund path.",
    },
    {
      code: RefundReasonCode.RefundPending,
      message: "Refund has already been initiated in Shopify and is pending.",
    },
    {
      code: RefundReasonCode.WithinRefundWindow,
      message: "Refund subject is within the 30-day refund window.",
    },
  ];
  refundResult.policyResult.itemEvaluations[0]!.reasons = [
    {
      code: RefundReasonCode.RefundPending,
      message: "Refund has already been initiated in Shopify and is pending.",
    },
  ];
  refundResult.policyResult.itemEvaluations[0]!.evidence.evaluatedLineItem.effectiveFinancialStatus =
    FinancialStatus.RefundPending;
  refundResult.policyResult.itemEvaluations[0]!.evidence.evaluatedLineItem.pendingRefundQuantity =
    1;

  const dashboardOrder = applyRefundEvaluationToOrder(
    makeDashboardOrder(),
    refundResult,
  );

  assert.equal(dashboardOrder.refundEvaluation.decision, RefundDecision.ManualReview);
  assert.equal(
    dashboardOrder.refundEvaluation.reasonSummary,
    "A refund is processing in Shopify for part of this order.",
  );
  assert.equal(
    dashboardOrder.refundEvaluation.recommendedNextAction,
    "Review item-level status before creating another refund.",
  );
  assert.deepEqual(
    dashboardOrder.refundEvaluation.itemEvaluations?.[0]?.evidence.slice(0, 4),
    [
      { label: "Fulfillment", value: "Fulfilled" },
      { label: "Financial Status", value: "Refund Pending" },
      { label: "Returnable Qty", value: "1" },
      { label: "Pending Refund Qty", value: "1" },
    ],
  );
});

test("loads merchant policy config from refund window env", async () => {
  const previousRefundWindowDays = process.env.REFUND_WINDOW_DAYS;

  try {
    process.env.REFUND_WINDOW_DAYS = "999";

    const config = await loadMerchantRefundPolicyConfig();

    assert.equal(config.refundWindowDays, 999);
  } finally {
    if (previousRefundWindowDays === undefined) {
      delete process.env.REFUND_WINDOW_DAYS;
    } else {
      process.env.REFUND_WINDOW_DAYS = previousRefundWindowDays;
    }
  }
});

test("summarizes missing returnable fulfillment distinctly", () => {
  const refundResult = makeRefundResult();
  refundResult.recommendedNextAction = RecommendedRefundAction.Deny;
  refundResult.policyResult.decision = RefundDecision.Ineligible;
  refundResult.policyResult.reasons = [
    {
      code: RefundReasonCode.ReturnableFulfillmentsUnavailable,
      message: "No returnable fulfillment was found for this refund subject.",
    },
  ];

  const dashboardOrder = applyRefundEvaluationToOrder(
    makeDashboardOrder(),
    refundResult,
  );

  assert.equal(
    dashboardOrder.refundEvaluation.reasonSummary,
    "No returnable fulfillment is available for this order.",
  );
  assert.equal(
    dashboardOrder.refundEvaluation.recommendedNextAction,
    "Review the Shopify order timeline before attempting another refund.",
  );
});
