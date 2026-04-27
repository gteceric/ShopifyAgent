import { checkRefundEligibility } from "@shopify-agent/core";
import { NextRequest, NextResponse } from "next/server";
import { parseRefundAgentRequest } from "./refund-agent-request";
import { selectRefundAgentResponder } from "./select-refund-agent-responder";
import { DASHBOARD_DEMO_POLICY } from "../../dashboard-order-evaluation";
import type {
  RefundAgentErrorResponse,
  RefundAgentRequestBody,
  RefundAgentResponse,
} from "../../refund-agent-contract";
import { formatMerchantRefundAgentResponse } from "../../refund-agent-response";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RefundAgentRequestBody;
    const parsedRequest = parseRefundAgentRequest(body);

    if (!parsedRequest.ok) {
      return NextResponse.json(parsedRequest.error, { status: 400 });
    }
    const { orderId, question } = parsedRequest.data;

    // Re-run the policy check on demand so the answer uses the latest backend
    // decision instead of only whatever happened to be rendered in the table.
    const result = await checkRefundEligibility(
      { orderId },
      { config: DASHBOARD_DEMO_POLICY },
    );
    const fallbackResponse = formatMerchantRefundAgentResponse(question, result);
    const selectedResponder = selectRefundAgentResponder();
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
        console.warn(
          "Model-backed web refund responder failed. Falling back to deterministic response.",
        );

        if (error instanceof Error) {
          console.warn(error.message);
        } else {
          console.warn(error);
        }
      }
    }

    const responseBody: RefundAgentResponse = {
      response,
      decision: result.decision,
      recommendedNextAction: result.recommendedNextAction,
      reasons: result.reasons.map((reason) => reason.message),
      usedFallback,
      provider,
    };

    return NextResponse.json(responseBody);
  } catch (error) {
    const errorResponse: RefundAgentErrorResponse = {
      error:
        error instanceof Error
          ? error.message
          : "Refund agent request failed.",
    };

    return NextResponse.json(
      errorResponse,
      { status: 500 },
    );
  }
}
