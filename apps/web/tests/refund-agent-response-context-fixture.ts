import {
  FinancialStatus,
  FulfillmentStatus,
  RecommendedRefundAction,
  RefundDecision,
  RefundReasonCode,
} from "@shopify-agent/core";
import type { RefundAgentResponseContext } from "../app/api/refund-agent/refund-agent-response-context.js";

export function makeEligibleRefundAgentResponseContext() {
  return {
    question: "Can I refund order #1001?",
    fallbackResponse:
      "Yes. This order is inside the refund window and can proceed through the standard refund flow.",
    result: {
      orderId: "gid://shopify/Order/1001",
      exceptionAvailable: false,
      escalationRequired: false,
      recommendedNextAction: RecommendedRefundAction.Approve,
      policyResult: {
        decision: RefundDecision.Eligible,
        reasons: [
          {
            code: RefundReasonCode.WithinRefundWindow,
            message: "Order is inside the 30-day refund window.",
          },
        ],
        evidence: {
          order: {
            id: "gid://shopify/Order/1001",
            name: "#1001",
            createdAt: "2026-03-01T00:00:00.000Z",
            ageDays: 7,
            totalAmount: 48,
            financialStatus: FinancialStatus.Paid,
            tags: [],
            flags: {
              fraudHold: false,
              manualReview: false,
              vipOverride: false,
            },
          },
          policyContext: {
            refundWindowDays: 30,
            effectiveRefundWindowDays: 30,
            cancelWindowDays: 30,
            effectiveCancelWindowDays: 30,
            matchedCategoryWindowCategories: [],
          },
          evaluatedOrder: {
            effectiveFinancialStatus: FinancialStatus.Paid,
            fulfillmentStatus: FulfillmentStatus.Fulfilled,
            hasAnyReturnableFulfillment: true,
            allLineItemsRefunded: false,
            allLineItemsFinalSale: false,
            itemCategories: [],
          },
        },
        itemEvaluations: [],
      },
    },
  } satisfies RefundAgentResponseContext;
}
