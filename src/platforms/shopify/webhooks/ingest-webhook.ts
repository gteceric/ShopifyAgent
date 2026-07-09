import { readOptionalStringEnv } from "@shopify-agent/core";
import { Prisma } from "@prisma/client";
import type { PlatformAccount, PlatformEvent } from "@prisma/client";
import { z } from "zod";
import {
  readShopifyWebhookHeader,
  SHOPIFY_WEBHOOK_HMAC_HEADER,
  type ShopifyWebhookHeaders,
  verifyShopifyWebhookHmac,
} from "./verify-webhook.js";
import {
  deactivateShopifyInstallation,
  type ShopifyInstallationClient,
} from "../persistence/installation.js";

const SHOPIFY_PLATFORM = "shopify";
const SHOPIFY_ORDER_GID_PATTERN = /^gid:\/\/shopify\/Order\/\d+$/;

const ShopifyWebhookResourceType = {
  Order: "order",
  Shop: "shop",
} as const;

type ShopifyWebhookResourceType =
  (typeof ShopifyWebhookResourceType)[keyof typeof ShopifyWebhookResourceType];

const ShopifyWebhookTopicCategory = {
  App: "app",
  Order: "order",
} as const;

type ShopifyWebhookTopicCategory =
  (typeof ShopifyWebhookTopicCategory)[keyof typeof ShopifyWebhookTopicCategory];

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

export const SUPPORTED_SHOPIFY_APP_WEBHOOK_TOPICS = [
  "app/uninstalled",
] as const;

export type SupportedShopifyAppWebhookTopic =
  (typeof SUPPORTED_SHOPIFY_APP_WEBHOOK_TOPICS)[number];

const SUPPORTED_SHOPIFY_WEBHOOK_TOPICS = [
  ...SUPPORTED_SHOPIFY_ORDER_WEBHOOK_TOPICS,
  ...SUPPORTED_SHOPIFY_APP_WEBHOOK_TOPICS,
] as const;

type SupportedShopifyWebhookTopic =
  (typeof SUPPORTED_SHOPIFY_WEBHOOK_TOPICS)[number];

const SupportedShopifyWebhookTopicSchema = z.enum(
  SUPPORTED_SHOPIFY_WEBHOOK_TOPICS,
);
const ShopifyOrderWebhookPayloadSchema = z.looseObject({
  admin_graphql_api_id: z.string().regex(SHOPIFY_ORDER_GID_PATTERN),
});
const ShopifyOrderChildWebhookPayloadSchema = z.looseObject({
  order_id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
});

interface IngestShopifyWebhookTransaction extends ShopifyInstallationClient {
  platformEvent: {
    create(args: Prisma.PlatformEventCreateArgs): Promise<PlatformEvent>;
  };
}

export interface IngestShopifyWebhookClient extends ShopifyInstallationClient {
  $transaction<T>(
    callback: (transaction: IngestShopifyWebhookTransaction) => Promise<T>,
  ): Promise<T>;
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

export interface IngestShopifyWebhookInput {
  rawBody: Buffer;
  headers: ShopifyWebhookHeaders;
}

export interface IngestShopifyWebhookDependencies {
  prisma: IngestShopifyWebhookClient;
  env?: NodeJS.ProcessEnv;
}

export interface IngestShopifyWebhookResult {
  duplicate: boolean;
  localPlatformEventId: string;
  platformOrderId?: string;
}

type ShopifyWebhookTopicRoute =
  | {
      category: typeof ShopifyWebhookTopicCategory.App;
      topic: SupportedShopifyAppWebhookTopic;
    }
  | {
      category: typeof ShopifyWebhookTopicCategory.Order;
      topic: SupportedShopifyOrderWebhookTopic;
    };

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
  const clientSecret = readOptionalStringEnv("SHOPIFY_APP_CLIENT_SECRET", env);

  if (!clientSecret) {
    throw new Error(
      "SHOPIFY_APP_CLIENT_SECRET is required to receive Shopify webhooks.",
    );
  }

  return clientSecret;
}

export function normalizeShopifyShopDomain(value: string): string {
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

function parseSupportedTopic(value: string): SupportedShopifyWebhookTopic {
  const result = SupportedShopifyWebhookTopicSchema.safeParse(value);

  if (!result.success) {
    throw new ShopifyWebhookRequestError(
      `Unsupported Shopify webhook topic: ${value}.`,
      400,
    );
  }

  return result.data;
}

function isOrderWebhookTopic(
  topic: SupportedShopifyWebhookTopic,
): topic is SupportedShopifyOrderWebhookTopic {
  return (SUPPORTED_SHOPIFY_ORDER_WEBHOOK_TOPICS as readonly string[]).includes(
    topic,
  );
}

function isAppWebhookTopic(
  topic: SupportedShopifyWebhookTopic,
): topic is SupportedShopifyAppWebhookTopic {
  return (SUPPORTED_SHOPIFY_APP_WEBHOOK_TOPICS as readonly string[]).includes(
    topic,
  );
}

function readShopifyWebhookTopicRoute(
  topic: SupportedShopifyWebhookTopic,
): ShopifyWebhookTopicRoute {
  if (isAppWebhookTopic(topic)) {
    return {
      category: ShopifyWebhookTopicCategory.App,
      topic,
    };
  }

  if (isOrderWebhookTopic(topic)) {
    return {
      category: ShopifyWebhookTopicCategory.Order,
      topic,
    };
  }

  const unhandledWebhookTopic: never = topic;
  throw new ShopifyWebhookRequestError(
    `Unsupported Shopify webhook topic: ${unhandledWebhookTopic}.`,
    400,
  );
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
      return ShopifyOrderWebhookPayloadSchema.parse(payload)
        .admin_graphql_api_id;

    case "refunds/create":
    case "order_transactions/create": {
      const orderId =
        ShopifyOrderChildWebhookPayloadSchema.parse(payload).order_id;

      return `gid://shopify/Order/${orderId}`;
    }
  }
}

function readPlatformOrderIdFromEvent(
  platformEvent: PlatformEvent,
): string | undefined {
  return platformEvent.resourceType === ShopifyWebhookResourceType.Order
    ? (platformEvent.resourceId ?? undefined)
    : undefined;
}

interface CreatePlatformEventInput {
  localPlatformAccount: PlatformAccount;
  platformEventId: string;
  topic: SupportedShopifyWebhookTopic;
  resourceType: ShopifyWebhookResourceType;
  resourceId: string;
  payload: Prisma.InputJsonValue;
}

interface CreateOrderPlatformEventInput {
  localPlatformAccount: PlatformAccount;
  platformEventId: string;
  topic: SupportedShopifyOrderWebhookTopic;
  platformOrderId: string;
}

interface HandleOrderWebhookTopicInput {
  localPlatformAccount: PlatformAccount;
  platformEventId: string;
  topic: SupportedShopifyOrderWebhookTopic;
  payload: unknown;
}

interface IngestAppUninstalledWebhookInput {
  localPlatformAccount: PlatformAccount;
  platformEventId: string;
  topic: SupportedShopifyAppWebhookTopic;
  receivedShopDomain: string;
}

interface HandleAppWebhookTopicInput {
  localPlatformAccount: PlatformAccount;
  platformEventId: string;
  topic: SupportedShopifyAppWebhookTopic;
  receivedShopDomain: string;
}

interface CreateAppUninstalledPlatformEventInput {
  localPlatformAccount: PlatformAccount;
  platformEventId: string;
  topic: SupportedShopifyAppWebhookTopic;
  receivedShopDomain: string;
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function findExistingPlatformEvent(
  prisma: IngestShopifyWebhookClient,
  localPlatformAccountId: string,
  platformEventId: string,
): Promise<PlatformEvent | null> {
  return prisma.platformEvent.findUnique({
    where: {
      platform_platformAccountId_platformEventId: {
        platform: SHOPIFY_PLATFORM,
        platformAccountId: localPlatformAccountId,
        platformEventId,
      },
    },
  });
}

async function createPlatformEvent(
  prisma: Pick<IngestShopifyWebhookTransaction, "platformEvent">,
  input: CreatePlatformEventInput,
): Promise<PlatformEvent> {
  const createData: Prisma.PlatformEventUncheckedCreateInput = {
    platformAccountId: input.localPlatformAccount.id,
    platform: SHOPIFY_PLATFORM,
    eventType: input.topic,
    platformEventId: input.platformEventId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    payload: input.payload,
  };

  return prisma.platformEvent.create({
    data: createData,
  });
}

async function createOrderPlatformEvent(
  prisma: Pick<IngestShopifyWebhookTransaction, "platformEvent">,
  input: CreateOrderPlatformEventInput,
): Promise<PlatformEvent> {
  const createOrderPlatformEventInput: CreatePlatformEventInput = {
    localPlatformAccount: input.localPlatformAccount,
    platformEventId: input.platformEventId,
    topic: input.topic,
    resourceType: ShopifyWebhookResourceType.Order,
    resourceId: input.platformOrderId,
    payload: {
      platformOrderId: input.platformOrderId,
    },
  };

  return createPlatformEvent(prisma, createOrderPlatformEventInput);
}

async function createAppUninstalledPlatformEvent(
  prisma: Pick<IngestShopifyWebhookTransaction, "platformEvent">,
  input: CreateAppUninstalledPlatformEventInput,
): Promise<PlatformEvent> {
  const platformEventInput: CreatePlatformEventInput = {
    localPlatformAccount: input.localPlatformAccount,
    platformEventId: input.platformEventId,
    topic: input.topic,
    resourceType: ShopifyWebhookResourceType.Shop,
    resourceId: input.localPlatformAccount.platformAccountId,
    payload: {
      shopDomain: input.receivedShopDomain,
    },
  };

  return createPlatformEvent(prisma, platformEventInput);
}

async function ingestAppUninstalledWebhook(
  dependencies: IngestShopifyWebhookDependencies,
  input: IngestAppUninstalledWebhookInput,
): Promise<IngestShopifyWebhookResult> {
  // Keep the uninstall audit event and token invalidation atomic.
  const localPlatformEvent = await dependencies.prisma.$transaction(
    async (transaction) => {
      const appUninstalledPlatformEventInput: CreateAppUninstalledPlatformEventInput =
        {
          localPlatformAccount: input.localPlatformAccount,
          platformEventId: input.platformEventId,
          topic: input.topic,
          receivedShopDomain: input.receivedShopDomain,
        };
      const platformEvent = await createAppUninstalledPlatformEvent(
        transaction,
        appUninstalledPlatformEventInput,
      );

      await deactivateShopifyInstallation(
        {
          localPlatformAccountId: input.localPlatformAccount.id,
          uninstalledAt: new Date(),
        },
        transaction,
      );

      return platformEvent;
    },
  );

  return {
    duplicate: false,
    localPlatformEventId: localPlatformEvent.id,
  };
}

async function handleAppWebhookTopic(
  dependencies: IngestShopifyWebhookDependencies,
  input: HandleAppWebhookTopicInput,
): Promise<IngestShopifyWebhookResult> {
  try {
    switch (input.topic) {
      case "app/uninstalled": {
        const appUninstalledWebhookInput: IngestAppUninstalledWebhookInput = {
          localPlatformAccount: input.localPlatformAccount,
          platformEventId: input.platformEventId,
          receivedShopDomain: input.receivedShopDomain,
          topic: input.topic,
        };

        return await ingestAppUninstalledWebhook(
          dependencies,
          appUninstalledWebhookInput,
        );
      }
    }

    const unhandledAppWebhookTopic: never = input.topic;
    throw new ShopifyWebhookRequestError(
      `Unsupported Shopify app webhook topic: ${unhandledAppWebhookTopic}.`,
      400,
    );
  } catch (error) {
    // Handle duplicate webhook delivery that wins the database race.
    if (!isUniqueConstraintViolation(error)) {
      throw error;
    }

    const duplicatePlatformEvent = await findExistingPlatformEvent(
      dependencies.prisma,
      input.localPlatformAccount.id,
      input.platformEventId,
    );

    if (!duplicatePlatformEvent) {
      throw error;
    }

    return {
      duplicate: true,
      localPlatformEventId: duplicatePlatformEvent.id,
      platformOrderId: readPlatformOrderIdFromEvent(
        duplicatePlatformEvent,
      ),
    };
  }
}

async function handleOrderWebhookTopic(
  dependencies: IngestShopifyWebhookDependencies,
  input: HandleOrderWebhookTopicInput,
): Promise<IngestShopifyWebhookResult> {
  let platformOrderId: string;

  try {
    platformOrderId = extractPlatformOrderId(input.topic, input.payload);
  } catch {
    throw new ShopifyWebhookRequestError(
      `Shopify ${input.topic} webhook payload is missing a valid order ID.`,
      400,
    );
  }

  try {
    const localPlatformEvent = await createOrderPlatformEvent(
      dependencies.prisma,
      {
        localPlatformAccount: input.localPlatformAccount,
        platformEventId: input.platformEventId,
        platformOrderId,
        topic: input.topic,
      },
    );

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
      input.localPlatformAccount.id,
      input.platformEventId,
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

export async function ingestShopifyWebhook(
  input: IngestShopifyWebhookInput,
  dependencies: IngestShopifyWebhookDependencies,
): Promise<IngestShopifyWebhookResult> {
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
  const receivedShopDomain = normalizeShopifyShopDomain(
    readRequiredHeader(input.headers, SHOPIFY_WEBHOOK_SHOP_DOMAIN_HEADER),
  );
  const localPlatformAccount =
    await dependencies.prisma.platformAccount.findFirst({
      where: {
        platform: SHOPIFY_PLATFORM,
        shopDomain: receivedShopDomain,
      },
    });

  if (!localPlatformAccount) {
    throw new ShopifyWebhookRequestError(
      "Shopify webhook shop is not installed.",
      403,
    );
  }

  const existingPlatformEvent = await findExistingPlatformEvent(
    dependencies.prisma,
    localPlatformAccount.id,
    platformEventId,
  );

  if (existingPlatformEvent) {
    return {
      duplicate: true,
      localPlatformEventId: existingPlatformEvent.id,
      platformOrderId: readPlatformOrderIdFromEvent(existingPlatformEvent),
    };
  }

  const payload = parseWebhookPayload(input.rawBody);
  const topicRoute = readShopifyWebhookTopicRoute(topic);

  switch (topicRoute.category) {
    case ShopifyWebhookTopicCategory.App: {
      const appWebhookTopicInput: HandleAppWebhookTopicInput = {
        localPlatformAccount,
        platformEventId,
        receivedShopDomain,
        topic: topicRoute.topic,
      };

      return await handleAppWebhookTopic(dependencies, appWebhookTopicInput);
    }

    case ShopifyWebhookTopicCategory.Order: {
      const orderWebhookTopicInput: HandleOrderWebhookTopicInput = {
        localPlatformAccount,
        platformEventId,
        payload,
        topic: topicRoute.topic,
      };

      return await handleOrderWebhookTopic(
        dependencies,
        orderWebhookTopicInput,
      );
    }
  }

  const unhandledTopicCategory: never = topicRoute;
  throw new ShopifyWebhookRequestError(
    `Unsupported Shopify webhook topic category: ${unhandledTopicCategory}.`,
    400,
  );
}
