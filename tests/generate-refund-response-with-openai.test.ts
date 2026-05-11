import {
  RecommendedRefundAction,
  RefundDecision,
  RefundReasonCode,
} from "@shopify-agent/core";
import test from "node:test";
import assert from "node:assert/strict";
import {
  createOpenAIRefundResponder,
  generateRefundResponseWithOpenAI,
} from "../src/tools/generate-refund-response-with-openai.js";
import type { RefundAgentResponseContext } from "../src/tools/get-refund-response.js";

function makeContext(): RefundAgentResponseContext {
  return {
    agentQuestion: "Can I refund order #1001?",
    fallbackResponse:
      "Yes. This order looks eligible for a refund. Order is within the 30-day refund window.",
    result: {
      orderId: "gid://shopify/Order/1",
      decision: RefundDecision.Eligible,
      exceptionAvailable: false,
      escalationRequired: false,
      recommendedNextAction: RecommendedRefundAction.Approve,
      reasons: [
        {
          code: RefundReasonCode.WithinRefundWindow,
          message: "Order is within the 30-day refund window.",
        },
      ],
      evidence: {
        order: {
          id: "gid://shopify/Order/1",
          name: "#1001",
          createdAt: "2026-03-01T00:00:00.000Z",
          ageDays: 7,
          totalAmount: 48,
          financialStatus: "paid",
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
          financialStatus: "paid",
          fulfillmentStatus: "fulfilled",
          hasReturnableFulfillments: true,
          alreadyFullyRefunded: false,
          finalSale: false,
          itemCategories: [],
        },
      },
      itemEvaluations: [],
    },
  };
}

test("returns undefined when no OpenAI API key is configured", async () => {
  const response = await generateRefundResponseWithOpenAI(makeContext(), {
    apiKey: "",
  });

  assert.equal(response, undefined);
});

test("returns output_text from the OpenAI Responses API payload", async () => {
  const response = await generateRefundResponseWithOpenAI(makeContext(), {
    apiKey: "test-key",
    fetchImpl: async () =>
      new Response(JSON.stringify({ output_text: "Model refund reply." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  });

  assert.equal(response, "Model refund reply.");
});

test("createOpenAIRefundResponder returns a responder object", async () => {
  const responder = createOpenAIRefundResponder({
    apiKey: "test-key",
    fetchImpl: async () =>
      new Response(JSON.stringify({ output_text: "Responder reply." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  });

  const response = await responder.generateResponse(makeContext());

  assert.equal(response, "Responder reply.");
});
