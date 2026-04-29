import { checkRefundEligibility } from "@shopify-agent/core";
import type { CheckRefundEligibilityResult } from "@shopify-agent/core";
import { parseRefundAgentRequest } from "./refund-agent-request";
import {
  selectRefundAgentResponder,
  type SelectedRefundAgentResponder,
} from "./select-refund-agent-responder";
import { DASHBOARD_DEMO_POLICY } from "../../dashboard-order-evaluation";
import type {
  RefundAgentErrorResponse,
  RefundAgentRequestBody,
  RefundAgentResponse,
} from "../../refund-agent-contract";
import { formatMerchantRefundAgentResponse } from "../../refund-agent-response";
import { logger } from "../../logger";

export interface RefundAgentRouteHandlerDeps {
  checkRefundEligibilityFn?: (
    input: { orderId: string },
    deps: { config: typeof DASHBOARD_DEMO_POLICY },
  ) => Promise<CheckRefundEligibilityResult>;
  formatResponse?: (
    question: string,
    result: CheckRefundEligibilityResult,
  ) => string;
  selectResponder?: () => SelectedRefundAgentResponder | undefined;
}

export type RefundAgentRouteHandlerResult = {
  status: number;
  body: RefundAgentResponse | RefundAgentErrorResponse;
};

export async function handleRefundAgentRequest(
  body: RefundAgentRequestBody,
  deps: RefundAgentRouteHandlerDeps = {},
): Promise<RefundAgentRouteHandlerResult> {
  const logPrefix = "[handleRefundAgentRequest]";
  const startedAt = Date.now();
  const parsedRequest = parseRefundAgentRequest(body);

  if (!parsedRequest.ok) {
    return {
      status: 400,
      body: parsedRequest.error,
    };
  }

  const { orderId, question } = parsedRequest.data;
  const checkRefundEligibilityFn =
    deps.checkRefundEligibilityFn ?? checkRefundEligibility;
  const formatResponse =
    deps.formatResponse ?? formatMerchantRefundAgentResponse;
  const selectResponder = deps.selectResponder ?? selectRefundAgentResponder;

  const result = await checkRefundEligibilityFn(
    { orderId },
    { config: DASHBOARD_DEMO_POLICY },
  );
  const fallbackResponse = formatResponse(question, result);
  const selectedResponder = selectResponder();
  let response = fallbackResponse;
  let usedFallback = true;
  let provider: RefundAgentResponse["provider"] = "fallback";

  if (selectedResponder) {
    try {
      const generatedResponse = await selectedResponder.generateResponse({
        question,
        fallbackResponse,
        result,
      });

      if (generatedResponse) {
        response = generatedResponse;
        usedFallback = false;
        provider = selectedResponder.provider;
      }
    } catch (error) {
      logger.warn(
        `${logPrefix} Model-backed web refund responder failed. Falling back to deterministic response.`,
      );
      logger.warn(
        `${logPrefix} Refund agent provider: ${selectedResponder.provider}`,
      );

      if (error instanceof Error) {
        logger.warn(`${logPrefix} ${error.message}`);
      } else {
        logger.warn(`${logPrefix} ${String(error)}`);
      }
    }
  }

  logger.info(
    `${logPrefix} Refund agent response completed in ${Date.now() - startedAt}ms (provider=${provider}, usedFallback=${usedFallback})`,
  );

  return {
    status: 200,
    body: {
      response,
      decision: result.decision,
      recommendedNextAction: result.recommendedNextAction,
      reasons: result.reasons.map((reason) => reason.message),
      usedFallback,
      provider,
    },
  };
}
