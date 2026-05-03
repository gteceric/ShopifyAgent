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
import type { RefundAgentResponseContext } from "../app/api/refund-agent/refund-agent-response-context.js";

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

test("throws a timeout error when the Ollama request is aborted", async () => {
  await assert.rejects(
    () =>
      generateRefundAgentResponseWithOllama(makeContext(), {
        timeoutMs: 10,
        fetchImpl: (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Request aborted", "AbortError"));
            });
          }),
      }),
    /Ollama responder timed out after 10ms/,
  );
});
