import type { ShopifyWebhookHeaders } from "../../../../../src/platforms/shopify/webhooks/verify-webhook";
import {
  ingestShopifyWebhook,
  ShopifyWebhookRequestError,
  type IngestShopifyWebhookClient,
  type IngestShopifyWebhookDependencies,
  type IngestShopifyWebhookInput,
} from "../../../../../src/platforms/shopify/webhooks/ingest-webhook";

const MAX_SHOPIFY_WEBHOOK_BODY_BYTES = 256 * 1024;

interface ShopifyWebhookAcceptedResponse {
  accepted: true;
  duplicate: boolean;
}

interface ErrorResponse {
  error: string;
}

export interface ShopifyWebhookRouteHandlerDependencies {
  prisma: IngestShopifyWebhookClient;
  env: NodeJS.ProcessEnv;
  logger: Pick<Console, "error">;
}

export type ShopifyWebhookRouteHandlerResult = {
  status: number;
  body: ShopifyWebhookAcceptedResponse | ErrorResponse;
};

function readShopifyWebhookHeaders(headers: Headers): ShopifyWebhookHeaders {
  const shopifyWebhookHeaders: Record<string, string> = {};

  headers.forEach((value, key) => {
    shopifyWebhookHeaders[key.toLowerCase()] = value;
  });

  return shopifyWebhookHeaders;
}

async function readRawBody(request: Request): Promise<Buffer> {
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (rawBody.length > MAX_SHOPIFY_WEBHOOK_BODY_BYTES) {
    throw new ShopifyWebhookRequestError(
      "Shopify webhook body is too large.",
      413,
    );
  }

  return rawBody;
}

export async function handleShopifyWebhookRequest(
  request: Request,
  dependencies: ShopifyWebhookRouteHandlerDependencies,
): Promise<ShopifyWebhookRouteHandlerResult> {
  try {
    const rawBody = await readRawBody(request);
    const ingestShopifyWebhookInput: IngestShopifyWebhookInput = {
      rawBody,
      headers: readShopifyWebhookHeaders(request.headers),
    };
    const ingestShopifyWebhookDependencies: IngestShopifyWebhookDependencies = {
      prisma: dependencies.prisma,
      env: dependencies.env,
    };
    const result = await ingestShopifyWebhook(
      ingestShopifyWebhookInput,
      ingestShopifyWebhookDependencies,
    );

    return {
      status: 200,
      body: {
        accepted: true,
        duplicate: result.duplicate,
      },
    };
  } catch (error) {
    if (error instanceof ShopifyWebhookRequestError) {
      return {
        status: error.httpStatusCode,
        body: {
          error: error.message,
        },
      };
    }

    dependencies.logger.error("[shopify/webhook] Failed to receive webhook.");
    dependencies.logger.error(error);

    return {
      status: 500,
      body: {
        error: "Failed to receive Shopify webhook.",
      },
    };
  }
}
