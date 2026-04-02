import test from "node:test";
import assert from "node:assert/strict";

import {
  RefundDecision,
  RefundReasonCode,
} from "../src/policy/refund-policy.types.js";
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
      reasons: [
        {
          code: RefundReasonCode.WithinRefundWindow,
          message: "Order is within the 30-day refund window.",
        },
      ],
      evidence: {
        orderAgeDays: 7,
        refundWindowDays: 30,
        cancelWindowDays: 30,
        financialStatus: "paid",
        fulfillmentStatus: "fulfilled",
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

test("createOpenAIRefundResponder returns a generateResponse-compatible function", async () => {
  const generateResponse = createOpenAIRefundResponder({
    apiKey: "test-key",
    fetchImpl: async () =>
      new Response(JSON.stringify({ output_text: "Responder reply." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  });

  const response = await generateResponse(makeContext());

  assert.equal(response, "Responder reply.");
});
