import {
  checkRefundEligibility,
  type RefundContextPlatformAdapter,
} from "@shopify-agent/core";
import { DASHBOARD_POLICY_CONFIG } from "../../dashboard-order-evaluation";
import { logger } from "../../logger";
import type {
  RefundAgentErrorResponse,
  RefundAgentRequestBody,
  RefundAgentResponse,
} from "../../refund-agent-contract";
import { formatMerchantRefundAgentResponse } from "../../refund-agent-response";
import { parseRefundAgentRequest } from "./refund-agent-request";
import type { RefundAgentResponder } from "./select-refund-agent-responder";

export interface RefundAgentRouteHandlerDeps {
  adapter: RefundContextPlatformAdapter;
  responder: RefundAgentResponder | undefined;
}

export type RefundAgentRouteHandlerResult = {
  status: number;
  body: RefundAgentResponse | RefundAgentErrorResponse;
};

export async function handleRefundAgentRequest(
  body: RefundAgentRequestBody,
  deps: RefundAgentRouteHandlerDeps,
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
  const result = await checkRefundEligibility(
    { orderId },
    {
      adapter: deps.adapter,
      config: DASHBOARD_POLICY_CONFIG,
    },
  );
  const fallbackResponse = formatMerchantRefundAgentResponse(question, result);
  const responder = deps.responder;
  let response = fallbackResponse;
  let usedFallback = true;
  let provider: RefundAgentResponse["provider"] = "fallback";

  if (responder) {
    try {
      const generatedResponse = await responder.generateResponse({
        question,
        fallbackResponse,
        result,
      });

      if (generatedResponse) {
        response = generatedResponse;
        usedFallback = false;
        provider = responder.provider;
      }
    } catch (error) {
      logger.warn(
        `${logPrefix} Model-backed web refund responder failed. Falling back to deterministic response.`,
      );
      logger.warn(`${logPrefix} Refund agent provider: ${responder.provider}`);

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
