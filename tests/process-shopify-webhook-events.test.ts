import assert from "node:assert/strict";
import test from "node:test";
import type { PlatformEvent, Prisma } from "@prisma/client";
import {
  processPendingShopifyWebhookEvents,
  type ProcessShopifyWebhookEventsClient,
} from "../src/platforms/shopify/webhooks/process-webhook-events.js";

function makePendingPlatformEvent(id: string, platformOrderId: string): PlatformEvent {
  return {
    id,
    platformAccountId: null,
    platform: "shopify",
    eventType: "orders/updated",
    platformEventId: `delivery:${id}`,
    resourceType: "order",
    resourceId: platformOrderId,
    payload: {
      platformOrderId,
    },
    processedAt: null,
    createdAt: new Date("2026-06-03T00:00:00.000Z"),
  };
}

class FakeProcessShopifyWebhookEventsClient
  implements ProcessShopifyWebhookEventsClient
{
  readonly updates: Prisma.PlatformEventUpdateArgs[] = [];

  constructor(readonly localPlatformEvents: PlatformEvent[]) {}

  readonly platformEvent = {
    findMany: async () => this.localPlatformEvents,
    update: async (args: Prisma.PlatformEventUpdateArgs) => {
      this.updates.push(args);

      const localPlatformEvent = this.localPlatformEvents.find(
        (event) => event.id === args.where.id,
      );

      assert.ok(localPlatformEvent);

      return {
        ...localPlatformEvent,
        platformAccountId: String(args.data.platformAccountId),
        processedAt: args.data.processedAt as Date,
      };
    },
  };
}

test("processes a pending Shopify webhook event by syncing its order snapshot", async () => {
  const processedAt = new Date("2026-06-03T01:00:00.000Z");
  const localPlatformEvent = makePendingPlatformEvent(
    "local-platform-event-1",
    "gid://shopify/Order/123",
  );
  const client = new FakeProcessShopifyWebhookEventsClient([
    localPlatformEvent,
  ]);
  const snapshotInputs: unknown[] = [];
  const result = await processPendingShopifyWebhookEvents(
    {
      limit: 1,
    },
    {
      prisma: client,
      loadShopifyShopIdentityFn: async () => ({
        id: "gid://shopify/Shop/1",
        myshopifyDomain: "demo-shop.myshopify.com",
      }),
      syncShopifyOrderSnapshotFn: async (input) => {
        snapshotInputs.push(input);

        return {
          localPlatformAccountId: "local-platform-account-1",
          localOrderId: "local-order-1",
          lineItemCount: 2,
          refundCount: 1,
        };
      },
      nowFn: () => processedAt,
    },
  );

  assert.deepEqual(snapshotInputs, [
    {
      platformOrderId: "gid://shopify/Order/123",
      platformAccountId: "gid://shopify/Shop/1",
      shopDomain: "demo-shop.myshopify.com",
    },
  ]);
  assert.deepEqual(client.updates, [
    {
      where: {
        id: "local-platform-event-1",
      },
      data: {
        platformAccountId: "local-platform-account-1",
        processedAt,
      },
    },
  ]);
  assert.deepEqual(result, {
    candidateEventCount: 1,
    processedEvents: [
      {
        localPlatformEventId: "local-platform-event-1",
        localOrderId: "local-order-1",
        platformOrderId: "gid://shopify/Order/123",
      },
    ],
    failedEvents: [],
  });
});

test("leaves a failed Shopify webhook event pending for a later retry", async () => {
  const localPlatformEvent = makePendingPlatformEvent(
    "local-platform-event-1",
    "gid://shopify/Order/123",
  );
  const client = new FakeProcessShopifyWebhookEventsClient([
    localPlatformEvent,
  ]);
  const result = await processPendingShopifyWebhookEvents(
    {},
    {
      prisma: client,
      loadShopifyShopIdentityFn: async () => ({
        id: "gid://shopify/Shop/1",
        myshopifyDomain: "demo-shop.myshopify.com",
      }),
      syncShopifyOrderSnapshotFn: async () => {
        throw new Error("Shopify Admin API unavailable.");
      },
    },
  );

  assert.deepEqual(client.updates, []);
  assert.deepEqual(result, {
    candidateEventCount: 1,
    processedEvents: [],
    failedEvents: [
      {
        localPlatformEventId: "local-platform-event-1",
        message: "Shopify Admin API unavailable.",
        platformOrderId: "gid://shopify/Order/123",
      },
    ],
  });
});
