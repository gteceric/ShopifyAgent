import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import type { PlatformAccount, PlatformEvent, Prisma } from "@prisma/client";
import {
  ingestShopifyWebhook,
  ShopifyWebhookRequestError,
  type IngestShopifyWebhookClient,
} from "../src/platforms/shopify/webhooks/ingest-webhook.js";
import {
  verifyShopifyWebhookHmac,
} from "../src/platforms/shopify/webhooks/verify-webhook.js";

const SHOP_DOMAIN = "demo-shop.myshopify.com";
const CLIENT_SECRET = "test-shopify-client-secret";

function signBody(rawBody: Buffer): string {
  return createHmac("sha256", CLIENT_SECRET)
    .update(rawBody)
    .digest("base64");
}

function makePlatformAccount(
  overrides: Partial<PlatformAccount> = {},
): PlatformAccount {
  return {
    id: "local-platform-account-1",
    platform: "shopify",
    platformAccountId: "gid://shopify/Shop/1",
    name: "Demo Shop",
    shopDomain: SHOP_DOMAIN,
    rawPayload: null,
    createdAt: new Date("2026-06-03T00:00:00.000Z"),
    updatedAt: new Date("2026-06-03T00:00:00.000Z"),
    ...overrides,
  };
}

function makePlatformEvent(
  data: Prisma.PlatformEventUncheckedCreateInput,
  id = "local-platform-event-1",
): PlatformEvent {
  return {
    id,
    platformAccountId: data.platformAccountId ?? null,
    platform: data.platform,
    eventType: data.eventType,
    platformEventId: data.platformEventId,
    resourceType: data.resourceType ?? null,
    resourceId: data.resourceId ?? null,
    payload: data.payload as Prisma.JsonValue,
    processedAt: data.processedAt ? new Date(data.processedAt) : null,
    createdAt: new Date("2026-06-03T00:00:00.000Z"),
  };
}

class FakeIngestShopifyWebhookClient implements IngestShopifyWebhookClient {
  readonly createdPlatformEventData: Prisma.PlatformEventUncheckedCreateInput[] =
    [];
  readonly localPlatformAccounts: PlatformAccount[];
  readonly existingPlatformEvents: PlatformEvent[];

  constructor(
    localPlatformAccount:
      | PlatformAccount
      | PlatformAccount[]
      | null = makePlatformAccount(),
    existingPlatformEvent: PlatformEvent | PlatformEvent[] | null = null,
  ) {
    this.localPlatformAccounts = Array.isArray(localPlatformAccount)
      ? localPlatformAccount
      : localPlatformAccount
        ? [localPlatformAccount]
        : [];
    this.existingPlatformEvents = Array.isArray(existingPlatformEvent)
      ? existingPlatformEvent
      : existingPlatformEvent
        ? [existingPlatformEvent]
        : [];
  }

  readonly platformAccount = {
    findFirst: async (args: Prisma.PlatformAccountFindFirstArgs) => {
      const where = args.where;

      return (
        this.localPlatformAccounts.find(
          (localPlatformAccount) =>
            localPlatformAccount.platform === where?.platform &&
            localPlatformAccount.shopDomain === where?.shopDomain,
        ) ?? null
      );
    },
  };

  readonly platformEvent = {
    findUnique: async (args: Prisma.PlatformEventFindUniqueArgs) => {
      const uniqueInput =
        args.where.platform_platformAccountId_platformEventId;

      if (!uniqueInput) {
        return null;
      }

      return (
        this.existingPlatformEvents.find(
          (event) =>
            event.platform === uniqueInput.platform &&
            event.platformAccountId === uniqueInput.platformAccountId &&
            event.platformEventId === uniqueInput.platformEventId,
        ) ?? null
      );
    },
    create: async (args: Prisma.PlatformEventCreateArgs) => {
      const data = args.data as Prisma.PlatformEventUncheckedCreateInput;

      this.createdPlatformEventData.push(data);

      return makePlatformEvent(data);
    },
  };
}

function makeSignedWebhookInput(
  topic: string,
  payload: Record<string, unknown>,
  overrides: Record<string, string | undefined> = {},
) {
  const rawBody = Buffer.from(JSON.stringify(payload));

  return {
    rawBody,
    headers: {
      "x-shopify-hmac-sha256": signBody(rawBody),
      "x-shopify-topic": topic,
      "x-shopify-shop-domain": SHOP_DOMAIN,
      "x-shopify-webhook-id": "webhook-delivery-1",
      ...overrides,
    },
  };
}

const env = {
  SHOPIFY_APP_CLIENT_SECRET: CLIENT_SECRET,
};

test("verifies Shopify webhook HMAC using the raw request body", () => {
  const rawBody = Buffer.from('{"id":123}');

  assert.equal(
    verifyShopifyWebhookHmac(rawBody, signBody(rawBody), CLIENT_SECRET),
    true,
  );
  assert.equal(
    verifyShopifyWebhookHmac(
      Buffer.from('{"id":124}'),
      signBody(rawBody),
      CLIENT_SECRET,
    ),
    false,
  );
});

test("receives a signed order webhook and stores a minimal inbox event", async () => {
  const client = new FakeIngestShopifyWebhookClient();
  const result = await ingestShopifyWebhook(
    makeSignedWebhookInput("orders/updated", {
      admin_graphql_api_id: "gid://shopify/Order/123",
      email: "customer@example.test",
    }),
    {
      prisma: client,
      env,
    },
  );

  assert.deepEqual(result, {
    duplicate: false,
    localPlatformEventId: "local-platform-event-1",
    platformOrderId: "gid://shopify/Order/123",
  });
  assert.deepEqual(client.createdPlatformEventData, [
    {
      platformAccountId: "local-platform-account-1",
      platform: "shopify",
      eventType: "orders/updated",
      platformEventId: "webhook-delivery-1",
      resourceType: "order",
      resourceId: "gid://shopify/Order/123",
      payload: {
        platformOrderId: "gid://shopify/Order/123",
      },
    },
  ]);
});

test("maps a refund webhook order ID to a Shopify order GID", async () => {
  const client = new FakeIngestShopifyWebhookClient();
  const result = await ingestShopifyWebhook(
    makeSignedWebhookInput("refunds/create", {
      id: 456,
      order_id: 123,
    }),
    {
      prisma: client,
      env,
    },
  );

  assert.equal(result.platformOrderId, "gid://shopify/Order/123");
  assert.equal(
    client.createdPlatformEventData[0]?.platformAccountId,
    "local-platform-account-1",
  );
});

test("accepts a duplicate signed webhook without inserting another inbox event", async () => {
  const existingPlatformEvent = makePlatformEvent({
    platformAccountId: "local-platform-account-1",
    platform: "shopify",
    eventType: "orders/updated",
    platformEventId: "webhook-delivery-1",
    resourceType: "order",
    resourceId: "gid://shopify/Order/123",
    payload: {
      platformOrderId: "gid://shopify/Order/123",
    },
  });
  const client = new FakeIngestShopifyWebhookClient(
    makePlatformAccount(),
    existingPlatformEvent,
  );
  const result = await ingestShopifyWebhook(
    makeSignedWebhookInput("orders/updated", {
      admin_graphql_api_id: "gid://shopify/Order/123",
    }),
    {
      prisma: client,
      env,
    },
  );

  assert.equal(result.duplicate, true);
  assert.equal(result.localPlatformEventId, existingPlatformEvent.id);
  assert.deepEqual(client.createdPlatformEventData, []);
});

test("scopes duplicate webhook detection to the installed shop", async () => {
  const firstPlatformAccount = makePlatformAccount();
  const secondPlatformAccount = makePlatformAccount({
    id: "local-platform-account-2",
    platformAccountId: "gid://shopify/Shop/2",
    shopDomain: "second-shop.myshopify.com",
  });
  const existingPlatformEvent = makePlatformEvent({
    platformAccountId: firstPlatformAccount.id,
    platform: "shopify",
    eventType: "orders/updated",
    platformEventId: "webhook-delivery-1",
    resourceType: "order",
    resourceId: "gid://shopify/Order/123",
    payload: {
      platformOrderId: "gid://shopify/Order/123",
    },
  });
  const client = new FakeIngestShopifyWebhookClient(
    [firstPlatformAccount, secondPlatformAccount],
    existingPlatformEvent,
  );
  const result = await ingestShopifyWebhook(
    makeSignedWebhookInput(
      "orders/updated",
      {
        admin_graphql_api_id: "gid://shopify/Order/456",
      },
      {
        "x-shopify-shop-domain": "second-shop.myshopify.com",
      },
    ),
    {
      prisma: client,
      env,
    },
  );

  assert.equal(result.duplicate, false);
  assert.deepEqual(client.createdPlatformEventData, [
    {
      platformAccountId: "local-platform-account-2",
      platform: "shopify",
      eventType: "orders/updated",
      platformEventId: "webhook-delivery-1",
      resourceType: "order",
      resourceId: "gid://shopify/Order/456",
      payload: {
        platformOrderId: "gid://shopify/Order/456",
      },
    },
  ]);
});

test("rejects a webhook with an invalid HMAC", async () => {
  const client = new FakeIngestShopifyWebhookClient();
  const input = makeSignedWebhookInput("orders/updated", {
    admin_graphql_api_id: "gid://shopify/Order/123",
  });

  input.headers["x-shopify-hmac-sha256"] = "invalid";

  await assert.rejects(
    ingestShopifyWebhook(input, {
      prisma: client,
      env,
    }),
    (error: unknown) =>
      error instanceof ShopifyWebhookRequestError &&
      error.httpStatusCode === 401,
  );
  assert.deepEqual(client.createdPlatformEventData, []);
});

test("rejects a signed webhook from a shop that is not installed", async () => {
  const client = new FakeIngestShopifyWebhookClient();

  await assert.rejects(
    ingestShopifyWebhook(
      makeSignedWebhookInput(
        "orders/updated",
        {
          admin_graphql_api_id: "gid://shopify/Order/123",
        },
        {
          "x-shopify-shop-domain": "another-shop.myshopify.com",
        },
      ),
      {
        prisma: client,
        env,
      },
    ),
    (error: unknown) =>
      error instanceof ShopifyWebhookRequestError &&
      error.httpStatusCode === 403 &&
      error.message === "Shopify webhook shop is not installed.",
  );
  assert.deepEqual(client.createdPlatformEventData, []);
});

test("rejects a signed webhook topic that is not supported by V1", async () => {
  const client = new FakeIngestShopifyWebhookClient();

  await assert.rejects(
    ingestShopifyWebhook(
      makeSignedWebhookInput("products/update", {
        admin_graphql_api_id: "gid://shopify/Product/123",
      }),
      {
        prisma: client,
        env,
      },
    ),
    (error: unknown) =>
      error instanceof ShopifyWebhookRequestError &&
      error.httpStatusCode === 400 &&
      error.message === "Unsupported Shopify webhook topic: products/update.",
  );
  assert.deepEqual(client.createdPlatformEventData, []);
});
