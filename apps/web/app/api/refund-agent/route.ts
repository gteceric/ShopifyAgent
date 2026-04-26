import { checkRefundEligibility } from "@shopify-agent/core";
import { NextRequest, NextResponse } from "next/server";
import { parseRefundAgentRequest } from "./refund-agent-request";
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
    const response = formatMerchantRefundAgentResponse(question, result);
    const responseBody: RefundAgentResponse = {
      response,
      decision: result.decision,
      recommendedNextAction: result.recommendedNextAction,
      reasons: result.reasons.map((reason) => reason.message),
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
