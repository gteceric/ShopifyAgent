import {
  checkRefundEligibility,
  RecommendedRefundAction,
  RefundDecision,
  RefundReasonCode,
} from "@shopify-agent/core";
import type {
  CheckRefundEligibilityDeps,
  CheckRefundEligibilityInput,
  CheckRefundEligibilityResult,
} from "@shopify-agent/core";
import { z } from "zod";
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
          "The recommended next action for the caller, such as approve, deny, refund_pending, no_action_needed, or route to manual review.",
      },
      policyResult: {
        type: "object",
        additionalProperties: false,
        properties: {
          decision: {
            type: "string",
            enum: Object.values(RefundDecision),
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
            additionalProperties: true,
            properties: {
              order: { type: "object", additionalProperties: true },
              policyContext: { type: "object", additionalProperties: true },
              evaluatedOrder: { type: "object", additionalProperties: true },
            },
            required: ["order", "policyContext", "evaluatedOrder"],
          },
          itemEvaluations: {
            type: "array",
            description:
              "Per-line-item refund decisions and evidence. This is the source of truth for item-level refund eligibility.",
            items: {
              type: "object",
              additionalProperties: true,
            },
          },
        },
        required: ["decision", "reasons", "evidence", "itemEvaluations"],
      },
    },
    required: [
      "orderId",
      "policyResult",
      "exceptionAvailable",
      "escalationRequired",
      "recommendedNextAction",
    ],
  },
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
} as const;

export function createCheckRefundEligibilityTool(
  deps: CheckRefundEligibilityDeps,
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
