import type {
  RecommendedRefundAction,
  RefundDecision,
} from "@shopify-agent/core";

export interface RefundAgentRequest {
  orderId: string;
  shopDomain: string | null;
  question: string;
}

export type RefundAgentProvider = "openai" | "ollama" | "fallback";

export interface RefundAgentResponse {
  response: string;
  decision: RefundDecision;
  recommendedNextAction: RecommendedRefundAction;
  reasons: string[];
  usedFallback: boolean;
  provider: RefundAgentProvider;
}

export interface RefundAgentErrorResponse {
  error: string;
}

// the following same as this
// type RefundAgentRequestBody = {
//   orderId?: unknown;
//   question?: unknown;
// };
export type RefundAgentRequestBody = Partial<
  Record<keyof RefundAgentRequest, unknown>
>;
