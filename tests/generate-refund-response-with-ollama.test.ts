import assert from "node:assert/strict";
import test from "node:test";
import {
  RecommendedRefundAction,
  RefundDecision,
  RefundReasonCode,
} from "@shopify-agent/core";
import { generateRefundResponseWithOllama } from "../src/tools/generate-refund-response-with-ollama.js";
import type { RefundAgentResponseContext } from "../src/tools/get-refund-response.js";

function makeContext(): RefundAgentResponseContext {
  return {
    agentQuestion: "Can I refund order #1001?",
    fallbackResponse: "This order is eligible for a refund.",
    result: {
      orderId: "gid://shopify/Order/1",
      exceptionAvailable: false,
      escalationRequired: false,
      recommendedNextAction: RecommendedRefundAction.Approve,
      policyResult: {
        decision: RefundDecision.Eligible,
        reasons: [
          {
            code: RefundReasonCode.WithinRefundWindow,
            message: "Order is within the refund window.",
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
            effectiveFinancialStatus: "paid",
            fulfillmentStatus: "fulfilled",
            hasAnyReturnableFulfillment: true,
            allLineItemsRefunded: false,
            allLineItemsFinalSale: false,
            itemCategories: [],
          },
        },
        itemEvaluations: [],
      },
    },
  };
}

test("times out an Ollama responder request", async () => {
  await assert.rejects(
    generateRefundResponseWithOllama(makeContext(), {
      timeoutMs: 10,
      fetchImpl: (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Request aborted", "AbortError"));
          });
        }),
    }),
    (error: unknown) =>
      error instanceof Error && error.name === "AbortError",
  );
});
