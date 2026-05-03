import assert from "node:assert/strict";
import test from "node:test";

import {
  FinancialStatus,
  FulfillmentStatus,
  RecommendedRefundAction,
  type RefundContextPlatformAdapter,
  RefundDecision,
  RefundPolicyInput,
} from "@shopify-agent/core";
import { handleRefundAgentRequest } from "../app/api/refund-agent/refund-agent-route-handler.js";

function makeAdapter(): RefundContextPlatformAdapter {
  return {
    platform: "test",
    loadRefundContext: async () =>
      ({
        orderId: "gid://shopify/Order/1001",
        orderName: "#1001",
        orderCreatedAt: "2025-10-17T00:00:00.000Z",
        orderAgeDays: 167,
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
      }) satisfies RefundPolicyInput,
  };
}

test("returns a 400 error when the request body is invalid", async () => {
  const result = await handleRefundAgentRequest(
    {
      question: "Can I refund this order?",
    },
    {
      adapter: makeAdapter(),
      responder: undefined,
    },
  );

  assert.deepEqual(result, {
    status: 400,
    body: { error: "Missing orderId." },
  });
});

test("returns an AI-backed response when the selected responder succeeds", async () => {
  const result = await handleRefundAgentRequest(
    {
      orderId: "gid://shopify/Order/1001",
      question: "Can I refund this order?",
    },
    {
      adapter: makeAdapter(),
      responder: {
        provider: "ollama",
        generateResponse: async () => "AI-assisted route answer.",
      },
    },
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    response: "AI-assisted route answer.",
    decision: RefundDecision.Ineligible,
    recommendedNextAction: RecommendedRefundAction.Deny,
    reasons: ["Order is outside the 30-day refund window."],
    usedFallback: false,
    provider: "ollama",
  });
});

test("falls back when the selected responder throws", async () => {
  const result = await handleRefundAgentRequest(
    {
      orderId: "gid://shopify/Order/1001",
      question: "Can I refund this order?",
    },
    {
      adapter: makeAdapter(),
      responder: {
        provider: "openai",
        generateResponse: async () => {
          throw new Error("Responder unavailable");
        },
      },
    },
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    response:
      "No. Order is outside the 30-day refund window. Next step: decline the refund request with policy wording.",
    decision: RefundDecision.Ineligible,
    recommendedNextAction: RecommendedRefundAction.Deny,
    reasons: ["Order is outside the 30-day refund window."],
    usedFallback: true,
    provider: "fallback",
  });
});

test("falls back when the selected responder returns an empty response", async () => {
  const result = await handleRefundAgentRequest(
    {
      orderId: "gid://shopify/Order/1001",
      question: "Can I refund this order?",
    },
    {
      adapter: makeAdapter(),
      responder: {
        provider: "ollama",
        generateResponse: async () => "", // empty response => need to use fallback
      },
    },
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    response:
      "No. Order is outside the 30-day refund window. Next step: decline the refund request with policy wording.",
    decision: RefundDecision.Ineligible,
    recommendedNextAction: RecommendedRefundAction.Deny,
    reasons: ["Order is outside the 30-day refund window."],
    usedFallback: true,
    provider: "fallback",
  });
});
