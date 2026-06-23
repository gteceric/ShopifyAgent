import type {
  RefundAgentErrorResponse,
  RefundAgentRequest,
  RefundAgentRequestBody,
} from "../../refund-agent-contract.js";

export type RefundAgentRequestParseResult =
  | {
      ok: true;
      data: RefundAgentRequest;
    }
  | {
      ok: false;
      error: RefundAgentErrorResponse;
    };

export function parseRefundAgentRequest(
  body: RefundAgentRequestBody,
): RefundAgentRequestParseResult {
  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  const shopDomain =
    typeof body.shopDomain === "string" ? body.shopDomain.trim() : null;
  const question =
    typeof body.question === "string" ? body.question.trim() : "";

  if (!orderId) {
    return {
      ok: false,
      error: { error: "Missing orderId." },
    };
  }

  if (!question) {
    return {
      ok: false,
      error: { error: "Enter a question for the refund agent." },
    };
  }

  return {
    ok: true,
    data: {
      orderId,
      shopDomain,
      question,
    },
  };
}
