import assert from "node:assert/strict";
import test from "node:test";

import {
  FinancialStatus,
  FulfillmentStatus,
  RecommendedRefundAction,
  RefundDecision,
  RefundReasonCode,
  type CheckRefundEligibilityResult,
} from "@shopify-agent/core";
import { applyRefundEvaluationToOrder } from "../app/dashboard-order-evaluation.js";
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
  assert.deepEqual(dashboardOrder.refundEvaluation.itemEvaluations, [
    {
      lineItemId: "gid://shopify/LineItem/1",
      title: "Dress",
      decision: RefundDecision.Ineligible,
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
