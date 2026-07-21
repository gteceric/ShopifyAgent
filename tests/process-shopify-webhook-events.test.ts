import assert from "node:assert/strict";
import test from "node:test";
import type { PlatformAccount, PlatformEvent, Prisma } from "@prisma/client";
import {
  DEFAULT_SHOPIFY_WEBHOOK_INITIAL_RETRY_DELAY_MS,
  DEFAULT_SHOPIFY_WEBHOOK_MAX_ATTEMPTS,
  DEFAULT_SHOPIFY_WEBHOOK_MAX_RETRY_DELAY_MS,
  processPendingShopifyWebhookEvents,
  type ProcessShopifyWebhookEventsClient,
  type ShopifyWebhookRetryPolicy,
} from "../src/platforms/shopify/webhooks/process-webhook-events.js";

const RETRY_POLICY: ShopifyWebhookRetryPolicy = {
  maxAttempts: DEFAULT_SHOPIFY_WEBHOOK_MAX_ATTEMPTS,
  initialDelayMs: DEFAULT_SHOPIFY_WEBHOOK_INITIAL_RETRY_DELAY_MS,
  maxDelayMs: DEFAULT_SHOPIFY_WEBHOOK_MAX_RETRY_DELAY_MS,
};

function makePlatformAccount(
  id = "local-platform-account-1",
  platformAccountId = "gid://shopify/Shop/1",
  shopDomain = "demo-shop.myshopify.com",
): PlatformAccount {
  return {
    id,
    platform: "shopify",
    platformAccountId,
    name: null,
    shopDomain,
    rawPayload: null,
    createdAt: new Date("2026-06-03T00:00:00.000Z"),
    updatedAt: new Date("2026-06-03T00:00:00.000Z"),
  };
}

function makePendingPlatformEvent(
  id: string,
  platformOrderId: string,
  platformAccountId = "local-platform-account-1",
  overrides: Partial<PlatformEvent> = {},
): PlatformEvent {
  return {
    id,
    platformAccountId,
    platform: "shopify",
    eventType: "orders/updated",
    platformEventId: `delivery:${id}`,
    resourceType: "order",
    resourceId: platformOrderId,
    payload: {
      platformOrderId,
    },
    status: "pending",
    attemptCount: 0,
    lastAttemptAt: null,
    nextAttemptAt: null,
    lastError: null,
    processedAt: null,
    createdAt: new Date("2026-06-03T00:00:00.000Z"),
    ...overrides,
  };
}

class FakeProcessShopifyWebhookEventsClient
  implements ProcessShopifyWebhookEventsClient
{
  readonly updates: Prisma.PlatformEventUpdateArgs[] = [];
  readonly findManyArgs: Prisma.PlatformEventFindManyArgs[] = [];

  constructor(
    readonly localPlatformEvents: PlatformEvent[],
    readonly localPlatformAccounts: PlatformAccount[] = [makePlatformAccount()],
  ) {}

  readonly platformAccount = {
    findUnique: async (args: Prisma.PlatformAccountFindUniqueArgs) =>
      this.localPlatformAccounts.find((account) => account.id === args.where.id) ??
      null,
  };

  readonly platformEvent = {
    findMany: async (args: Prisma.PlatformEventFindManyArgs) => {
      this.findManyArgs.push(args);

      return this.localPlatformEvents;
    },
    update: async (args: Prisma.PlatformEventUpdateArgs) => {
      this.updates.push(args);

      const localPlatformEvent = this.localPlatformEvents.find(
        (event) => event.id === args.where.id,
      );

      assert.ok(localPlatformEvent);

      return {
        ...localPlatformEvent,
        platformAccountId:
          typeof args.data.platformAccountId === "string"
            ? args.data.platformAccountId
            : localPlatformEvent.platformAccountId,
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
      retryPolicy: RETRY_POLICY,
    },
    {
      prisma: client,
      syncShopifyOrderSnapshotForAccountFn: async (
        input,
        localPlatformAccount,
      ) => {
        snapshotInputs.push({ input, localPlatformAccount });

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
      input: {
        platformOrderId: "gid://shopify/Order/123",
        platformAccountId: "gid://shopify/Shop/1",
        shopDomain: "demo-shop.myshopify.com",
      },
      localPlatformAccount: makePlatformAccount(),
    },
  ]);
  assert.deepEqual(client.findManyArgs[0]?.where?.status, {
    in: ["pending", "retrying"],
  });
  assert.deepEqual(client.findManyArgs[0]?.where?.OR, [
    {
      nextAttemptAt: null,
    },
    {
      nextAttemptAt: {
        lte: processedAt,
      },
    },
  ]);
  assert.deepEqual(client.updates, [
    {
      where: {
        id: "local-platform-event-1",
      },
      data: {
        platformAccountId: "local-platform-account-1",
        status: "processed",
        attemptCount: 1,
        lastAttemptAt: processedAt,
        nextAttemptAt: null,
        lastError: null,
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

test("records a failed Shopify webhook event for a later retry", async () => {
  const attemptedAt = new Date("2026-06-03T01:00:00.000Z");
  const nextAttemptAt = new Date(
    attemptedAt.getTime() + RETRY_POLICY.initialDelayMs,
  );
  const localPlatformEvent = makePendingPlatformEvent(
    "local-platform-event-1",
    "gid://shopify/Order/123",
  );
  const client = new FakeProcessShopifyWebhookEventsClient([
    localPlatformEvent,
  ]);
  const result = await processPendingShopifyWebhookEvents(
    {
      retryPolicy: RETRY_POLICY,
    },
    {
      prisma: client,
      syncShopifyOrderSnapshotForAccountFn: async () => {
        throw new Error("Shopify Admin API unavailable.");
      },
      nowFn: () => attemptedAt,
    },
  );

  assert.deepEqual(client.updates, [
    {
      where: {
        id: "local-platform-event-1",
      },
      data: {
        status: "retrying",
        attemptCount: 1,
        lastAttemptAt: attemptedAt,
        nextAttemptAt,
        lastError: "Shopify Admin API unavailable.",
      },
    },
  ]);
  assert.deepEqual(result, {
    candidateEventCount: 1,
    processedEvents: [],
    failedEvents: [
      {
        attemptCount: 1,
        localPlatformEventId: "local-platform-event-1",
        message: "Shopify Admin API unavailable.",
        nextAttemptAt,
        platformOrderId: "gid://shopify/Order/123",
        status: "retrying",
      },
    ],
  });
});

test("caps exponential webhook retry delays at the configured maximum", async () => {
  const attemptedAt = new Date("2026-06-03T01:00:00.000Z");
  const cappedRetryPolicy: ShopifyWebhookRetryPolicy = {
    maxAttempts: 5,
    initialDelayMs: 60_000,
    maxDelayMs: 90_000,
  };
  const expectedNextAttemptAt = new Date(
    attemptedAt.getTime() + cappedRetryPolicy.maxDelayMs,
  );
  const localPlatformEvent = makePendingPlatformEvent(
    "local-platform-event-1",
    "gid://shopify/Order/123",
    "local-platform-account-1",
    {
      status: "retrying",
      attemptCount: 1,
      lastAttemptAt: new Date("2026-06-03T00:30:00.000Z"),
      nextAttemptAt: attemptedAt,
      lastError: "Earlier failure.",
    },
  );
  const client = new FakeProcessShopifyWebhookEventsClient([
    localPlatformEvent,
  ]);

  await processPendingShopifyWebhookEvents(
    {
      retryPolicy: cappedRetryPolicy,
    },
    {
      prisma: client,
      syncShopifyOrderSnapshotForAccountFn: async () => {
        throw new Error("Shopify Admin API remains unavailable.");
      },
      nowFn: () => attemptedAt,
    },
  );

  assert.equal(client.updates[0]?.data.attemptCount, 2);
  assert.deepEqual(
    client.updates[0]?.data.nextAttemptAt,
    expectedNextAttemptAt,
  );
});

test("routes each pending webhook event through its own merchant account", async () => {
  const firstAccount = makePlatformAccount();
  const secondAccount = makePlatformAccount(
    "local-platform-account-2",
    "gid://shopify/Shop/2",
    "second-shop.myshopify.com",
  );
  const client = new FakeProcessShopifyWebhookEventsClient(
    [
      makePendingPlatformEvent(
        "local-platform-event-1",
        "gid://shopify/Order/123",
        firstAccount.id,
      ),
      makePendingPlatformEvent(
        "local-platform-event-2",
        "gid://shopify/Order/456",
        secondAccount.id,
      ),
    ],
    [firstAccount, secondAccount],
  );
  const routedShopDomains: string[] = [];

  const result = await processPendingShopifyWebhookEvents(
    {
      limit: 2,
      retryPolicy: RETRY_POLICY,
    },
    {
      prisma: client,
      syncShopifyOrderSnapshotForAccountFn: async (
        input,
        localPlatformAccount,
      ) => {
        routedShopDomains.push(localPlatformAccount.shopDomain ?? "");

        return {
          localPlatformAccountId: localPlatformAccount.id,
          localOrderId: `local:${input.platformOrderId}`,
          lineItemCount: 0,
          refundCount: 0,
        };
      },
    },
  );

  assert.deepEqual(routedShopDomains, [
    "demo-shop.myshopify.com",
    "second-shop.myshopify.com",
  ]);
  assert.equal(result.processedEvents.length, 2);
  assert.deepEqual(result.failedEvents, []);
});

test("moves a webhook event to dead letter after its final attempt", async () => {
  const attemptedAt = new Date("2026-06-03T01:00:00.000Z");
  const localPlatformEvent = makePendingPlatformEvent(
    "local-platform-event-1",
    "gid://shopify/Order/123",
    "local-platform-account-1",
    {
      status: "retrying",
      attemptCount: RETRY_POLICY.maxAttempts - 1,
      lastAttemptAt: new Date("2026-06-03T00:30:00.000Z"),
      nextAttemptAt: attemptedAt,
      lastError: "Earlier failure.",
    },
  );
  const client = new FakeProcessShopifyWebhookEventsClient([
    localPlatformEvent,
  ]);
  const result = await processPendingShopifyWebhookEvents(
    {
      retryPolicy: RETRY_POLICY,
    },
    {
      prisma: client,
      syncShopifyOrderSnapshotForAccountFn: async () => {
        throw new Error("Shopify Admin API remains unavailable.");
      },
      nowFn: () => attemptedAt,
    },
  );

  assert.deepEqual(client.updates, [
    {
      where: {
        id: "local-platform-event-1",
      },
      data: {
        status: "dead_letter",
        attemptCount: RETRY_POLICY.maxAttempts,
        lastAttemptAt: attemptedAt,
        nextAttemptAt: null,
        lastError: "Shopify Admin API remains unavailable.",
      },
    },
  ]);
  assert.deepEqual(result.failedEvents, [
    {
      attemptCount: RETRY_POLICY.maxAttempts,
      localPlatformEventId: "local-platform-event-1",
      message: "Shopify Admin API remains unavailable.",
      platformOrderId: "gid://shopify/Order/123",
      status: "dead_letter",
    },
  ]);
});
