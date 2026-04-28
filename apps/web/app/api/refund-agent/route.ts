import { checkRefundEligibility } from "@shopify-agent/core";
import { NextRequest, NextResponse } from "next/server";
import { handleRefundAgentRequest } from "./refund-agent-route-handler";
import type {
  RefundAgentErrorResponse,
  RefundAgentRequestBody,
} from "../../refund-agent-contract";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RefundAgentRequestBody;
    const result = await handleRefundAgentRequest(body, {
      checkRefundEligibilityFn: checkRefundEligibility,
    });

    return NextResponse.json(result.body, { status: result.status });
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
