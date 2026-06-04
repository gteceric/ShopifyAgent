import { Prisma } from "@prisma/client";
import type { PlatformAccount, PlatformEvent } from "@prisma/client";
import { z } from "zod";
import {
  readShopifyWebhookHeader,
  SHOPIFY_WEBHOOK_HMAC_HEADER,
  type ShopifyWebhookHeaders,
  verifyShopifyWebhookHmac,
} from "./verify-webhook.js";

const SHOPIFY_PLATFORM = "shopify";
const SHOPIFY_ORDER_GID_PATTERN = /^gid:\/\/shopify\/Order\/\d+$/;

export const SHOPIFY_WEBHOOK_ID_HEADER = "x-shopify-webhook-id";
export const SHOPIFY_WEBHOOK_TOPIC_HEADER = "x-shopify-topic";
export const SHOPIFY_WEBHOOK_SHOP_DOMAIN_HEADER = "x-shopify-shop-domain";

export const SUPPORTED_SHOPIFY_ORDER_WEBHOOK_TOPICS = [
  "orders/create",
  "orders/updated",
  "orders/cancelled",
  "orders/paid",
  "orders/fulfilled",
  "orders/partially_fulfilled",
  "orders/edited",
  "refunds/create",
  "order_transactions/create",
] as const;

export type SupportedShopifyOrderWebhookTopic =
  (typeof SUPPORTED_SHOPIFY_ORDER_WEBHOOK_TOPICS)[number];

const SupportedShopifyOrderWebhookTopicSchema = z.enum(
  SUPPORTED_SHOPIFY_ORDER_WEBHOOK_TOPICS,
);
const ShopifyOrderWebhookPayloadSchema = z.looseObject({
  admin_graphql_api_id: z.string().regex(SHOPIFY_ORDER_GID_PATTERN),
});
const ShopifyOrderChildWebhookPayloadSchema = z.looseObject({
  order_id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
});

export interface ReceiveShopifyWebhookClient {
  platformAccount: {
    findFirst(
      args: Prisma.PlatformAccountFindFirstArgs,
    ): Promise<PlatformAccount | null>;
  };
  platformEvent: {
    findUnique(
      args: Prisma.PlatformEventFindUniqueArgs,
    ): Promise<PlatformEvent | null>;
    create(args: Prisma.PlatformEventCreateArgs): Promise<PlatformEvent>;
  };
}

export interface ReceiveShopifyWebhookInput {
  rawBody: Buffer;
  headers: ShopifyWebhookHeaders;
}

export interface ReceiveShopifyWebhookDependencies {
  prisma: ReceiveShopifyWebhookClient;
  env?: NodeJS.ProcessEnv;
}

export interface ReceiveShopifyWebhookResult {
  duplicate: boolean;
  localPlatformEventId: string;
  platformOrderId: string;
}

export class ShopifyWebhookRequestError extends Error {
  readonly httpStatusCode: number;

  constructor(message: string, httpStatusCode: number) {
    super(message);
    this.name = "ShopifyWebhookRequestError";
    this.httpStatusCode = httpStatusCode;
  }
}

function readRequiredHeader(
  headers: ShopifyWebhookHeaders,
  name: string,
): string {
  const value = readShopifyWebhookHeader(headers, name);

  if (!value) {
    throw new ShopifyWebhookRequestError(`${name} header is required.`, 400);
  }

  return value;
}

function readShopifyAppClientSecret(env: NodeJS.ProcessEnv): string {
  const clientSecret = env.SHOPIFY_APP_CLIENT_SECRET?.trim();

  if (!clientSecret) {
    throw new Error(
      "SHOPIFY_APP_CLIENT_SECRET is required to receive Shopify webhooks.",
    );
  }

  return clientSecret;
}

function normalizeShopDomain(value: string): string {
  const normalizedValue = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");

  if (!normalizedValue || normalizedValue.includes("/")) {
    throw new ShopifyWebhookRequestError("Invalid Shopify shop domain.", 400);
  }

  return normalizedValue;
}

function readConfiguredShopDomain(env: NodeJS.ProcessEnv): string {
  const shopDomain = env.SHOPIFY_STORE_DOMAIN?.trim();

  if (!shopDomain) {
    throw new Error(
      "SHOPIFY_STORE_DOMAIN is required to receive Shopify webhooks.",
    );
  }

  return normalizeShopDomain(shopDomain);
}

function parseWebhookPayload(rawBody: Buffer): unknown {
  try {
    return JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new ShopifyWebhookRequestError(
      "Shopify webhook body must be valid JSON.",
      400,
    );
  }
}

function parseSupportedTopic(value: string): SupportedShopifyOrderWebhookTopic {
  const result = SupportedShopifyOrderWebhookTopicSchema.safeParse(value);

  if (!result.success) {
    throw new ShopifyWebhookRequestError(
      `Unsupported Shopify webhook topic: ${value}.`,
      400,
    );
  }

  return result.data;
}

function extractPlatformOrderId(
  topic: SupportedShopifyOrderWebhookTopic,
  payload: unknown,
): string {
  switch (topic) {
    case "orders/create":
    case "orders/updated":
    case "orders/cancelled":
    case "orders/paid":
    case "orders/fulfilled":
    case "orders/partially_fulfilled":
    case "orders/edited":
      return ShopifyOrderWebhookPayloadSchema.parse(
        payload,
      ).admin_graphql_api_id;

    case "refunds/create":
    case "order_transactions/create": {
      const orderId =
        ShopifyOrderChildWebhookPayloadSchema.parse(payload).order_id;

      return `gid://shopify/Order/${orderId}`;
    }
  }
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function findExistingPlatformEvent(
  prisma: ReceiveShopifyWebhookClient,
  platformEventId: string,
): Promise<PlatformEvent | null> {
  return prisma.platformEvent.findUnique({
    where: {
      platform_platformEventId: {
        platform: SHOPIFY_PLATFORM,
        platformEventId,
      },
    },
  });
}

async function createPlatformEvent(
  prisma: ReceiveShopifyWebhookClient,
  input: {
    localPlatformAccountId?: string;
    platformEventId: string;
    platformOrderId: string;
    topic: SupportedShopifyOrderWebhookTopic;
  },
): Promise<PlatformEvent> {
  const createData: Prisma.PlatformEventUncheckedCreateInput = {
    platformAccountId: input.localPlatformAccountId,
    platform: SHOPIFY_PLATFORM,
    eventType: input.topic,
    platformEventId: input.platformEventId,
    resourceType: "order",
    resourceId: input.platformOrderId,
    payload: {
      platformOrderId: input.platformOrderId,
    },
  };

  return prisma.platformEvent.create({
    data: createData,
  });
}

export async function receiveShopifyWebhook(
  input: ReceiveShopifyWebhookInput,
  dependencies: ReceiveShopifyWebhookDependencies,
): Promise<ReceiveShopifyWebhookResult> {
  const env = dependencies.env ?? process.env;
  const clientSecret = readShopifyAppClientSecret(env);
  const providedHmac = readShopifyWebhookHeader(
    input.headers,
    SHOPIFY_WEBHOOK_HMAC_HEADER,
  );

  if (!verifyShopifyWebhookHmac(input.rawBody, providedHmac, clientSecret)) {
    throw new ShopifyWebhookRequestError(
      "Shopify webhook HMAC verification failed.",
      401,
    );
  }

  const platformEventId = readRequiredHeader(
    input.headers,
    SHOPIFY_WEBHOOK_ID_HEADER,
  );
  const topic = parseSupportedTopic(
    readRequiredHeader(input.headers, SHOPIFY_WEBHOOK_TOPIC_HEADER),
  );
  const receivedShopDomain = normalizeShopDomain(
    readRequiredHeader(input.headers, SHOPIFY_WEBHOOK_SHOP_DOMAIN_HEADER),
  );
  const configuredShopDomain = readConfiguredShopDomain(env);

  if (receivedShopDomain !== configuredShopDomain) {
    throw new ShopifyWebhookRequestError(
      "Shopify webhook shop domain does not match the configured store.",
      403,
    );
  }

  const payload = parseWebhookPayload(input.rawBody);
  let platformOrderId: string;

  try {
    platformOrderId = extractPlatformOrderId(topic, payload);
  } catch {
    throw new ShopifyWebhookRequestError(
      `Shopify ${topic} webhook payload is missing a valid order ID.`,
      400,
    );
  }

  const existingPlatformEvent = await findExistingPlatformEvent(
    dependencies.prisma,
    platformEventId,
  );

  if (existingPlatformEvent) {
    return {
      duplicate: true,
      localPlatformEventId: existingPlatformEvent.id,
      platformOrderId,
    };
  }

  const localPlatformAccount =
    await dependencies.prisma.platformAccount.findFirst({
      where: {
        platform: SHOPIFY_PLATFORM,
        shopDomain: configuredShopDomain,
      },
    });

  try {
    const localPlatformEvent = await createPlatformEvent(dependencies.prisma, {
      localPlatformAccountId: localPlatformAccount?.id,
      platformEventId,
      platformOrderId,
      topic,
    });

    return {
      duplicate: false,
      localPlatformEventId: localPlatformEvent.id,
      platformOrderId,
    };
  } catch (error) {
    if (!isUniqueConstraintViolation(error)) {
      throw error;
    }

    const duplicatePlatformEvent = await findExistingPlatformEvent(
      dependencies.prisma,
      platformEventId,
    );

    if (!duplicatePlatformEvent) {
      throw error;
    }

    return {
      duplicate: true,
      localPlatformEventId: duplicatePlatformEvent.id,
      platformOrderId,
    };
  }
}
