import assert from "node:assert/strict";
import test from "node:test";

import {
  FinancialStatus,
  FulfillmentStatus,
  RecommendedRefundAction,
  RefundDecision,
  RefundReasonCode,
} from "@shopify-agent/core";
import { generateRefundAgentResponseWithOpenAI } from "../app/api/refund-agent/generate-refund-agent-response-with-openai.js";

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

test("returns undefined when no OpenAI API key is configured", async () => {
  const response = await generateRefundAgentResponseWithOpenAI(makeContext(), {
    apiKey: "",
  });

  assert.equal(response, undefined);
});

test("returns output_text from the OpenAI Responses API payload", async () => {
  const response = await generateRefundAgentResponseWithOpenAI(makeContext(), {
    apiKey: "test-key",
    fetchImpl: async () =>
      new Response(JSON.stringify({ output_text: "AI-assisted refund answer." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  });

  assert.equal(response, "AI-assisted refund answer.");
});

test("throws a timeout error when the OpenAI request is aborted", async () => {
  await assert.rejects(
    () =>
      generateRefundAgentResponseWithOpenAI(makeContext(), {
        apiKey: "test-key",
        timeoutMs: 10,
        fetchImpl: (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Request aborted", "AbortError"));
            });
          }),
      }),
    /OpenAI responder timed out after 10ms/,
  );
});
