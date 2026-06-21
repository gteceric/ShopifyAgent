import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import type { PlatformAccount, PlatformEvent, Prisma } from "@prisma/client";
import {
  handleShopifyWebhookRequest,
  type ShopifyWebhookRouteHandlerDependencies,
} from "../app/webhooks/shopify/route-handler";

type ShopifyWebhookRouteClient = ShopifyWebhookRouteHandlerDependencies["prisma"];

const CLIENT_SECRET = "shopify-client-secret";
const SHOP_DOMAIN = "nextlensfix.myshopify.com";
const NOW = new Date("2026-06-16T00:00:00.000Z");

function signBody(rawBody: Buffer): string {
  return createHmac("sha256", CLIENT_SECRET).update(rawBody).digest("base64");
}

function makePlatformAccount(): PlatformAccount {
  return {
    id: "platform-account-1",
    platform: "shopify",
    platformAccountId: "gid://shopify/Shop/1",
    name: "NextLensFix",
    shopDomain: SHOP_DOMAIN,
    rawPayload: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makePlatformEvent(input: {
  platformEventId: string;
  resourceId: string;
}): PlatformEvent {
  return {
    id: "platform-event-1",
    platformAccountId: "platform-account-1",
    platform: "shopify",
    eventType: "orders/updated",
    platformEventId: input.platformEventId,
    resourceType: "order",
    resourceId: input.resourceId,
    payload: {
      platformOrderId: input.resourceId,
    },
    processedAt: null,
    createdAt: NOW,
  };
}

class FakeShopifyWebhookRouteClient implements ShopifyWebhookRouteClient {
  platformEventCreateArgs?: Prisma.PlatformEventCreateArgs;

  platformAccount = {
    findFirst: async () => makePlatformAccount(),
  };

  platformEvent = {
    findUnique: async () => null,
    create: async (args: Prisma.PlatformEventCreateArgs) => {
      this.platformEventCreateArgs = args;

      return makePlatformEvent({
        platformEventId: String(args.data.platformEventId),
        resourceId: String(args.data.resourceId),
      });
    },
  };
}

function makeDependencies(
  prisma = new FakeShopifyWebhookRouteClient(),
): ShopifyWebhookRouteHandlerDependencies {
  return {
    prisma,
    env: {
      SHOPIFY_APP_CLIENT_SECRET: CLIENT_SECRET,
    },
    logger: {
      error: () => {},
    },
  };
}

function makeSignedWebhookRequest(input: {
  deliveryId: string;
  rawBody: Buffer;
}): Request {
  return new Request("https://commerceops.example.com/webhooks/shopify", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-hmac-sha256": signBody(input.rawBody),
      "x-shopify-shop-domain": SHOP_DOMAIN,
      "x-shopify-topic": "orders/updated",
      "x-shopify-webhook-id": input.deliveryId,
    },
    body: input.rawBody,
  });
}

test("receives a signed Shopify webhook through the Next route handler", async () => {
  const prisma = new FakeShopifyWebhookRouteClient();
  const rawBody = Buffer.from(
    JSON.stringify({
      admin_graphql_api_id: "gid://shopify/Order/123",
    }),
  );
  const result = await handleShopifyWebhookRequest(
    makeSignedWebhookRequest({
      deliveryId: "delivery-1",
      rawBody,
    }),
    makeDependencies(prisma),
  );

  assert.deepEqual(result, {
    status: 200,
    body: {
      accepted: true,
      duplicate: false,
    },
  });
  assert.equal(
    prisma.platformEventCreateArgs?.data.platformEventId,
    "delivery-1",
  );
  assert.equal(
    prisma.platformEventCreateArgs?.data.resourceId,
    "gid://shopify/Order/123",
  );
});

test("rejects a Shopify webhook with an invalid signature", async () => {
  const rawBody = Buffer.from(
    JSON.stringify({
      admin_graphql_api_id: "gid://shopify/Order/123",
    }),
  );
  const request = makeSignedWebhookRequest({
    deliveryId: "delivery-2",
    rawBody,
  });
  request.headers.set("x-shopify-hmac-sha256", "invalid");

  const result = await handleShopifyWebhookRequest(
    request,
    makeDependencies(),
  );

  assert.deepEqual(result, {
    status: 401,
    body: {
      error: "Shopify webhook HMAC verification failed.",
    },
  });
});
