import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import type { PlatformAccount, PlatformEvent, Prisma } from "@prisma/client";
import {
  receiveShopifyWebhook,
  ShopifyWebhookRequestError,
  type ReceiveShopifyWebhookClient,
} from "../src/platforms/shopify/webhooks/receive-webhook.js";
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

function makePlatformAccount(): PlatformAccount {
  return {
    id: "local-platform-account-1",
    platform: "shopify",
    platformAccountId: "gid://shopify/Shop/1",
    name: "Demo Shop",
    shopDomain: SHOP_DOMAIN,
    rawPayload: null,
    createdAt: new Date("2026-06-03T00:00:00.000Z"),
    updatedAt: new Date("2026-06-03T00:00:00.000Z"),
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

class FakeReceiveShopifyWebhookClient implements ReceiveShopifyWebhookClient {
  readonly createdPlatformEventData: Prisma.PlatformEventUncheckedCreateInput[] =
    [];

  constructor(
    readonly localPlatformAccount: PlatformAccount | null = makePlatformAccount(),
    readonly existingPlatformEvent: PlatformEvent | null = null,
  ) {}

  readonly platformAccount = {
    findFirst: async () => this.localPlatformAccount,
  };

  readonly platformEvent = {
    findUnique: async () => this.existingPlatformEvent,
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
  SHOPIFY_STORE_DOMAIN: SHOP_DOMAIN,
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
  const client = new FakeReceiveShopifyWebhookClient();
  const result = await receiveShopifyWebhook(
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
  const client = new FakeReceiveShopifyWebhookClient(null);
  const result = await receiveShopifyWebhook(
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
    undefined,
  );
});

test("accepts a duplicate signed webhook without inserting another inbox event", async () => {
  const existingPlatformEvent = makePlatformEvent({
    platform: "shopify",
    eventType: "orders/updated",
    platformEventId: "webhook-delivery-1",
    resourceType: "order",
    resourceId: "gid://shopify/Order/123",
    payload: {
      platformOrderId: "gid://shopify/Order/123",
    },
  });
  const client = new FakeReceiveShopifyWebhookClient(
    makePlatformAccount(),
    existingPlatformEvent,
  );
  const result = await receiveShopifyWebhook(
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

test("rejects a webhook with an invalid HMAC", async () => {
  const client = new FakeReceiveShopifyWebhookClient();
  const input = makeSignedWebhookInput("orders/updated", {
    admin_graphql_api_id: "gid://shopify/Order/123",
  });

  input.headers["x-shopify-hmac-sha256"] = "invalid";

  await assert.rejects(
    receiveShopifyWebhook(input, {
      prisma: client,
      env,
    }),
    (error: unknown) =>
      error instanceof ShopifyWebhookRequestError &&
      error.httpStatusCode === 401,
  );
  assert.deepEqual(client.createdPlatformEventData, []);
});

test("rejects a signed webhook from another shop domain", async () => {
  const client = new FakeReceiveShopifyWebhookClient();

  await assert.rejects(
    receiveShopifyWebhook(
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
      error.httpStatusCode === 403,
  );
  assert.deepEqual(client.createdPlatformEventData, []);
});

test("rejects a signed webhook topic that is not supported by V1", async () => {
  const client = new FakeReceiveShopifyWebhookClient();

  await assert.rejects(
    receiveShopifyWebhook(
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
