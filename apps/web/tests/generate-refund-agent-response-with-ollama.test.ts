import assert from "node:assert/strict";
import test from "node:test";

import {
  FinancialStatus,
  FulfillmentStatus,
  RecommendedRefundAction,
  RefundDecision,
  RefundReasonCode,
} from "@shopify-agent/core";
import { generateRefundAgentResponseWithOllama } from "../app/api/refund-agent/generate-refund-agent-response-with-ollama.js";

function makeContext() {
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
        cancelWindowDays: 30,
        orderTotalAmount: 48,
        financialStatus: FinancialStatus.Paid,
        fulfillmentStatus: FulfillmentStatus.Fulfilled,
        hasReturnableFulfillments: true,
        alreadyFullyRefunded: false,
        allItemsFinalSale: false,
        flags: {
          fraudHold: false,
          manualReview: false,
          vipOverride: false,
        },
      },
    },
  };
}

test("returns message content from the Ollama chat payload", async () => {
  const response = await generateRefundAgentResponseWithOllama(makeContext(), {
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          message: { content: "Ollama-assisted refund answer." },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
  });

  assert.equal(response, "Ollama-assisted refund answer.");
});
