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
      decision: RefundDecision.Eligible,
      exceptionAvailable: false,
      escalationRequired: false,
      recommendedNextAction: RecommendedRefundAction.Approve,
      reasons: [
        {
          code: RefundReasonCode.WithinRefundWindow,
          message: "Order is inside the 30-day refund window.",
        },
      ],
      evidence: {
        orderAgeDays: 7,
        refundWindowDays: 30,
        effectiveRefundWindowDays: 30,
        cancelWindowDays: 30,
        effectiveCancelWindowDays: 30,
        orderTotalAmount: 48,
        financialStatus: FinancialStatus.Paid,
        fulfillmentStatus: FulfillmentStatus.Fulfilled,
        hasReturnableFulfillments: true,
        alreadyFullyRefunded: false,
        allItemsFinalSale: false,
        itemCategories: [],
        policyTags: [],
        matchedCategoryWindowCategories: [],
        flags: {
          fraudHold: false,
          manualReview: false,
          vipOverride: false,
        },
      },
    },
  } satisfies RefundAgentResponseContext;
}
