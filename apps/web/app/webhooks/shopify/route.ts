import { NextRequest, NextResponse } from "next/server";
import { getPrismaClient } from "../../../../../src/persistence/prisma-client";
import { logger } from "../../logger";
import { buildShopifyAppRuntimeEnv } from "../../shopify-app-env";
import { handleShopifyWebhookRequest } from "./route-handler";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const result = await handleShopifyWebhookRequest(request, {
    prisma: getPrismaClient(),
    env: buildShopifyAppRuntimeEnv(),
    logger,
  });

  return NextResponse.json(result.body, { status: result.status });
}
