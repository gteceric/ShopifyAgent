import type { CheckRefundEligibilityResult } from "@shopify-agent/core";

export interface RefundAgentResponseContext {
  question: string;
  fallbackResponse: string;
  result: CheckRefundEligibilityResult;
}
