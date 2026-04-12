import { z } from "zod";

import {
  FinancialStatus,
  FulfillmentStatus,
  RefundDecision,
  RefundReasonCode,
} from "../../policy/refund-policy.types.js";
import { checkRefundEligibility } from "../../tools/check-refund-eligibility.js";
import type {
  CheckRefundEligibilityDeps,
  CheckRefundEligibilityInput,
  CheckRefundEligibilityResult,
} from "../../tools/check-refund-eligibility.js";
import { RecommendedRefundAction } from "../../tools/check-refund-eligibility.js";
import { makeMcpToolErrorResult, makeMcpToolResult } from "../tool-results.js";
import type { McpTool } from "../tool-types.js";

export const CHECK_REFUND_ELIGIBILITY_TOOL_NAME = "check_refund_eligibility";
const SHOPIFY_ORDER_GID_PATTERN = /^gid:\/\/shopify\/Order\/\d+$/;

export const CheckRefundEligibilityArgsSchema = z.object({
  orderId: z.string().regex(
    SHOPIFY_ORDER_GID_PATTERN,
    "orderId must be a Shopify order GID like gid://shopify/Order/123.",
  ),
});

const CHECK_REFUND_ELIGIBILITY_TOOL = {
  name: CHECK_REFUND_ELIGIBILITY_TOOL_NAME,
  title: "Check Refund Eligibility",
  description:
    "Load Shopify order context and evaluate the merchant's refund policy for a single order.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      orderId: {
        type: "string",
        description: "The Shopify order GID to evaluate, for example gid://shopify/Order/123.",
      },
    },
    required: ["orderId"],
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      orderId: {
        type: "string",
      },
      decision: {
        type: "string",
        enum: Object.values(RefundDecision),
      },
      exceptionAvailable: {
        type: "boolean",
        description:
          "Whether the evaluation indicates an active exception, such as a VIP override.",
      },
      escalationRequired: {
        type: "boolean",
        description: "Whether a human review or escalation step is required.",
      },
      recommendedNextAction: {
        type: "string",
        enum: Object.values(RecommendedRefundAction),
        description:
          "The recommended next action for the caller: approve, deny, or route to manual review.",
      },
      reasons: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            code: {
              type: "string",
              enum: Object.values(RefundReasonCode),
            },
            message: {
              type: "string",
            },
          },
          required: ["code", "message"],
        },
      },
      evidence: {
        type: "object",
        additionalProperties: false,
        properties: {
          orderAgeDays: {
            type: "number",
          },
          refundWindowDays: {
            type: "number",
          },
          cancelWindowDays: {
            type: "number",
          },
          orderTotalAmount: {
            type: "number",
          },
          highValueOrderThreshold: {
            type: "number",
          },
          financialStatus: {
            type: "string",
            enum: Object.values(FinancialStatus),
          },
          fulfillmentStatus: {
            type: "string",
            enum: Object.values(FulfillmentStatus),
          },
          hasReturnableFulfillments: {
            type: "boolean",
          },
          alreadyFullyRefunded: {
            type: "boolean",
          },
          allItemsFinalSale: {
            type: "boolean",
          },
          flags: {
            type: "object",
            additionalProperties: false,
            properties: {
              fraudHold: {
                type: "boolean",
              },
              manualReview: {
                type: "boolean",
              },
              vipOverride: {
                type: "boolean",
              },
            },
            required: ["fraudHold", "manualReview", "vipOverride"],
          },
        },
        required: [
          "orderAgeDays",
          "refundWindowDays",
          "cancelWindowDays",
          "orderTotalAmount",
          "financialStatus",
          "fulfillmentStatus",
          "hasReturnableFulfillments",
          "alreadyFullyRefunded",
          "allItemsFinalSale",
          "flags",
        ],
      },
    },
    required: [
      "orderId",
      "decision",
      "exceptionAvailable",
      "escalationRequired",
      "recommendedNextAction",
      "reasons",
      "evidence",
    ],
  },
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
} as const;

export function createCheckRefundEligibilityTool(
  deps: CheckRefundEligibilityDeps = {},
): McpTool<CheckRefundEligibilityInput, CheckRefundEligibilityResult> {
  return {
    name: CHECK_REFUND_ELIGIBILITY_TOOL_NAME,
    definition: CHECK_REFUND_ELIGIBILITY_TOOL,
    invalidArgsMessage:
      "check_refund_eligibility requires a Shopify order GID like gid://shopify/Order/123.",
    argsSchema: CheckRefundEligibilityArgsSchema,
    async execute(args) {
      try {
        const result = await checkRefundEligibility(args, deps);
        return makeMcpToolResult(result);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Refund eligibility check failed.";

        return makeMcpToolErrorResult(message);
      }
    },
  };
}
