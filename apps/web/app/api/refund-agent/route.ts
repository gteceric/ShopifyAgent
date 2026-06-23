import { createShopifyRefundContextAdapter } from "@shopify-agent/core";
import { NextRequest, NextResponse } from "next/server";
import { resolveCurrentShopifyAdminClient } from "../../shopify-admin-client-resolver";
import { handleRefundAgentRequest } from "./refund-agent-route-handler";
import { createRefundAgentResponder } from "./select-refund-agent-responder";
import type {
  RefundAgentErrorResponse,
  RefundAgentRequestBody,
} from "../../refund-agent-contract";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RefundAgentRequestBody;
    const useRealShopify = process.env.USE_REAL_SHOPIFY === "true";
    const shopDomain =
      typeof body.shopDomain === "string" ? body.shopDomain.trim() : null;
    const shopifyAdminClient = useRealShopify
      ? await resolveCurrentShopifyAdminClient(shopDomain)
      : undefined;
    const result = await handleRefundAgentRequest(body, {
      adapter: createShopifyRefundContextAdapter(
        shopifyAdminClient
          ? {
              env: process.env,
              shopifyAdminClient,
            }
          : {
              env: process.env,
            },
      ), // load context from platform
      responder: createRefundAgentResponder(fetch), // use model to create response based on refundPolicyInput
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    const errorResponse: RefundAgentErrorResponse = {
      error:
        error instanceof Error ? error.message : "Refund agent request failed.",
    };

    return NextResponse.json(errorResponse, { status: 500 });
  }
}
