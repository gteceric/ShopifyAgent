import assert from "node:assert/strict";
import test from "node:test";
import type {
  PlatformAccount,
  PlatformEvent,
  Prisma,
  ShopifyInstallation,
} from "@prisma/client";
import {
  SHOPIFY_INSTALLATION_ACTIVE_STATUS,
} from "../src/platforms/shopify/persistence/installation.js";
import { encryptCredential } from "../src/security/credential-encryption.js";
import { createShopifyWebhookWorkerDependencies } from "../src/platforms/shopify/webhooks/create-worker-dependencies.js";
import { processPendingShopifyWebhookEvents } from "../src/platforms/shopify/webhooks/process-webhook-events.js";

const ENCRYPTION_KEY = Buffer.alloc(32, 7);

function makePlatformAccount(
  id: string,
  platformAccountId: string,
  shopDomain: string,
): PlatformAccount {
  return {
    id,
    platform: "shopify",
    platformAccountId,
    name: null,
    shopDomain,
    rawPayload: null,
    createdAt: new Date("2026-06-08T00:00:00.000Z"),
    updatedAt: new Date("2026-06-08T00:00:00.000Z"),
  };
}

function makePlatformEvent(
  id: string,
  platformAccountId: string,
  platformOrderId: string,
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
    processedAt: null,
    createdAt: new Date("2026-06-08T00:00:00.000Z"),
  };
}

function makeInstallation(
  id: string,
  platformAccountId: string,
  accessToken: string,
): ShopifyInstallation {
  return {
    id,
    platformAccountId,
    status: SHOPIFY_INSTALLATION_ACTIVE_STATUS,
    encryptedAccessToken: encryptCredential(accessToken, ENCRYPTION_KEY),
    encryptedRefreshToken: null,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
    grantedScopes: ["read_orders"],
    installedAt: new Date("2026-06-08T00:00:00.000Z"),
    uninstalledAt: null,
    createdAt: new Date("2026-06-08T00:00:00.000Z"),
    updatedAt: new Date("2026-06-08T00:00:00.000Z"),
  };
}

test("processes each webhook event with its merchant installation credentials", async () => {
  const firstAccount = makePlatformAccount(
    "local-platform-account-1",
    "gid://shopify/Shop/1",
    "first-shop.myshopify.com",
  );
  const secondAccount = makePlatformAccount(
    "local-platform-account-2",
    "gid://shopify/Shop/2",
    "second-shop.myshopify.com",
  );
  const platformAccounts = [firstAccount, secondAccount];
  const platformEvents = [
    makePlatformEvent(
      "local-platform-event-1",
      firstAccount.id,
      "gid://shopify/Order/101",
    ),
    makePlatformEvent(
      "local-platform-event-2",
      secondAccount.id,
      "gid://shopify/Order/202",
    ),
  ];
  const installations = [
    makeInstallation("installation-1", firstAccount.id, "first-access-token"),
    makeInstallation("installation-2", secondAccount.id, "second-access-token"),
  ];
  const updatedEventIds: string[] = [];
  const prisma = {
    platformAccount: {
      findUnique: async (args: Prisma.PlatformAccountFindUniqueArgs) =>
        platformAccounts.find((account) => account.id === args.where.id) ?? null,
    },
    platformEvent: {
      findMany: async (_args: Prisma.PlatformEventFindManyArgs) => platformEvents,
      update: async (args: Prisma.PlatformEventUpdateArgs) => {
        updatedEventIds.push(String(args.where.id));

        return platformEvents.find((event) => event.id === args.where.id)!;
      },
    },
    shopifyInstallation: {
      findUnique: async (args: Prisma.ShopifyInstallationFindUniqueArgs) =>
        installations.find(
          (installation) =>
            installation.platformAccountId === args.where.platformAccountId,
        ) ?? null,
      update: async (_args: Prisma.ShopifyInstallationUpdateArgs) =>
        installations[0]!,
      upsert: async (_args: Prisma.ShopifyInstallationUpsertArgs) =>
        installations[0]!,
    },
  };
  const requests: Array<{ accessToken: string; url: string }> = [];
  const dependencies = createShopifyWebhookWorkerDependencies({
    prisma,
    credentialEncryptionKey: ENCRYPTION_KEY,
    apiVersion: "2026-01",
    fetchImpl: async (input, init) => {
      const headers = init?.headers as Record<string, string>;
      requests.push({
        accessToken: headers["X-Shopify-Access-Token"] ?? "",
        url: String(input),
      });

      return new Response(JSON.stringify({ data: { shop: { id: "shop" } } }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    },
    syncShopifyOrderSnapshotFn: async (input, shopifyAdminClient) => {
      await shopifyAdminClient.fetch("query Shop { shop { id } }", {});

      return {
        localPlatformAccountId:
          input.platformAccountId === firstAccount.platformAccountId
            ? firstAccount.id
            : secondAccount.id,
        localOrderId: `local:${input.platformOrderId}`,
        lineItemCount: 0,
        refundCount: 0,
      };
    },
  });

  const result = await processPendingShopifyWebhookEvents(
    {
      limit: 2,
    },
    dependencies,
  );

  assert.deepEqual(requests, [
    {
      accessToken: "first-access-token",
      url: "https://first-shop.myshopify.com/admin/api/2026-01/graphql.json",
    },
    {
      accessToken: "second-access-token",
      url: "https://second-shop.myshopify.com/admin/api/2026-01/graphql.json",
    },
  ]);
  assert.deepEqual(updatedEventIds, [
    "local-platform-event-1",
    "local-platform-event-2",
  ]);
  assert.equal(result.processedEvents.length, 2);
  assert.deepEqual(result.failedEvents, []);
});
