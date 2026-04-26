import { checkRefundEligibility } from "@shopify-agent/core";
import { NextResponse } from "next/server";
import { DASHBOARD_DEMO_POLICY } from "../../dashboard-order-evaluation";
import { formatMerchantRefundAgentResponse } from "../../refund-agent-response";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      orderId?: unknown;
      question?: unknown;
    };
    const orderId =
      typeof body.orderId === "string" ? body.orderId.trim() : "";
    const question =
      typeof body.question === "string" ? body.question.trim() : "";

    if (!orderId) {
      return NextResponse.json(
        { error: "Missing orderId." },
        { status: 400 },
      );
    }

    if (!question) {
      return NextResponse.json(
        { error: "Enter a question for the refund agent." },
        { status: 400 },
      );
    }

    // Re-run the policy check on demand so the answer uses the latest backend
    // decision instead of only whatever happened to be rendered in the table.
    const result = await checkRefundEligibility(
      { orderId },
      { config: DASHBOARD_DEMO_POLICY },
    );
    const response = formatMerchantRefundAgentResponse(question, result);

    return NextResponse.json({
      response,
      decision: result.decision,
      recommendedNextAction: result.recommendedNextAction,
      reasons: result.reasons.map((reason) => reason.message),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Refund agent request failed.",
      },
      { status: 500 },
    );
  }
}
