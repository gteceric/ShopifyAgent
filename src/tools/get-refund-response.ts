import { checkRefundEligibility } from "@shopify-agent/core";
import type {
  CheckRefundEligibilityDependencies,
  CheckRefundEligibilityResult,
} from "@shopify-agent/core";
import { formatRefundEligibilityResponse } from "./format-refund-eligibility-response.js";

export interface RefundAgentResponseContext {
  agentQuestion: string;
  result: CheckRefundEligibilityResult;
  fallbackResponse: string;
}

export interface RefundResponseResponder {
  generateResponse(
    context: RefundAgentResponseContext,
  ): Promise<string | undefined>;
}

export interface RefundResponseDependencies extends CheckRefundEligibilityDependencies {
  responder: RefundResponseResponder | undefined;
}

export interface GetRefundResponseResult {
  orderId: string;
  agentQuestion: string;
  response: string;
  fallbackResponse: string;
  usedFallback: boolean;
  result: CheckRefundEligibilityResult;
}

export async function getRefundResponse(
  orderId: string,
  agentQuestion: string,
  dependencies: RefundResponseDependencies,
): Promise<GetRefundResponseResult> {
  const result = await checkRefundEligibility({ orderId }, dependencies);
  const fallbackResponse = formatRefundEligibilityResponse(
    agentQuestion,
    result,
  );

  // fallback to deterministic response if no custom responder / AI generator
  if (!dependencies.responder) {
    return {
      orderId,
      agentQuestion,
      response: fallbackResponse,
      fallbackResponse,
      usedFallback: true,
      result,
    };
  }

  try {
    const generatedResponse = await dependencies.responder.generateResponse({
      agentQuestion,
      result,
      fallbackResponse,
    });

    if (generatedResponse && generatedResponse.trim().length > 0) {
      return {
        orderId,
        agentQuestion,
        response: generatedResponse.trim(),
        fallbackResponse,
        usedFallback: false,
        result,
      };
    }
  } catch (error) {
    console.warn(
      "Model-backed refund responder failed. Falling back to deterministic response.",
    );

    if (error instanceof Error) {
      console.warn(error.message);
    } else {
      console.warn(error);
    }
  }

  return {
    orderId,
    agentQuestion,
    response: fallbackResponse,
    fallbackResponse,
    usedFallback: true,
    result,
  };
}
