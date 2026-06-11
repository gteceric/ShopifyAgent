import assert from "node:assert/strict";
import test from "node:test";
import type {
  PlatformAccount,
  Prisma,
  ShopifyInstallation,
} from "@prisma/client";
import {
  maintainShopifyInstallationTokens,
  type FindShopifyInstallationsDueForTokenRefreshInput,
  type ShopifyTokenMaintenanceCandidate,
} from "../src/platforms/shopify/auth/maintain-installation-tokens.js";
import {
  ShopifyInstallationRequiresReauthorizationError,
  SHOPIFY_INSTALLATION_ACTIVE_STATUS,
  type ShopifyInstallationClient,
} from "../src/platforms/shopify/persistence/installation.js";

const ENCRYPTION_KEY = Buffer.alloc(32, 7);
const unexpectedFetch: typeof fetch = async () => {
  throw new Error("Unexpected HTTP request.");
};

function makePlatformAccount(
  id: string,
  shopDomain: string | null,
): PlatformAccount {
  return {
    id,
    platform: "shopify",
    platformAccountId: `gid://shopify/Shop/${id}`,
    name: null,
    shopDomain,
    rawPayload: null,
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-01T00:00:00.000Z"),
  };
}

function makeCandidate(
  id: string,
  shopDomain: string | null,
): ShopifyTokenMaintenanceCandidate {
  const installation: ShopifyInstallation = {
    id: `installation-${id}`,
    platformAccountId: id,
    status: SHOPIFY_INSTALLATION_ACTIVE_STATUS,
    encryptedAccessToken: "encrypted-access-token",
    encryptedRefreshToken: "encrypted-refresh-token",
    accessTokenExpiresAt: new Date("2026-06-09T01:00:00.000Z"),
    refreshTokenExpiresAt: new Date("2026-06-20T00:00:00.000Z"),
    grantedScopes: ["read_orders"],
    installedAt: new Date("2026-06-01T00:00:00.000Z"),
    uninstalledAt: null,
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-01T00:00:00.000Z"),
  };

  return {
    ...installation,
    platformAccount: makePlatformAccount(id, shopDomain),
  };
}

class FakeShopifyInstallationClient implements ShopifyInstallationClient {
  readonly shopifyInstallation = {
    findUnique: async (_args: Prisma.ShopifyInstallationFindUniqueArgs) => null,
    update: async (_args: Prisma.ShopifyInstallationUpdateArgs) => {
      throw new Error("Unexpected installation update.");
    },
    upsert: async (_args: Prisma.ShopifyInstallationUpsertArgs) => {
      throw new Error("Unexpected installation upsert.");
    },
  };
}

test("refreshes a bounded batch of Shopify installations expiring within 30 days", async () => {
  const now = new Date("2026-06-09T00:00:00.000Z");
  const findInputs: FindShopifyInstallationsDueForTokenRefreshInput[] = [];
  const refreshedAccountIds: string[] = [];
  const candidates = [
    makeCandidate("platform-account-1", "first-shop.myshopify.com"),
    makeCandidate("platform-account-2", "second-shop.myshopify.com"),
  ];

  const result = await maintainShopifyInstallationTokens(
    {
      batchSize: 2,
    },
    {
      prisma: new FakeShopifyInstallationClient(),
      credentialEncryptionKey: ENCRYPTION_KEY,
      appClientId: "shopify-app-client-id",
      appClientSecret: "shopify-app-client-secret",
      fetchImpl: unexpectedFetch,
      nowFn: () => now,
      findCandidatesFn: async (input) => {
        findInputs.push(input);
        return candidates;
      },
      refreshInstallationTokensFn: async (input) => {
        refreshedAccountIds.push(input.localPlatformAccountId);

        return {
          accessToken: "rotated-access-token",
          installation: candidates[0]!,
        };
      },
    },
  );

  assert.deepEqual(findInputs, [
    {
      batchSize: 2,
      refreshBefore: new Date("2026-07-09T00:00:00.000Z"),
    },
  ]);
  assert.deepEqual(refreshedAccountIds, [
    "platform-account-1",
    "platform-account-2",
  ]);
  assert.deepEqual(result, {
    candidateCount: 2,
    refreshBefore: new Date("2026-07-09T00:00:00.000Z"),
    refreshedInstallations: [
      {
        localPlatformAccountId: "platform-account-1",
        shopDomain: "first-shop.myshopify.com",
      },
      {
        localPlatformAccountId: "platform-account-2",
        shopDomain: "second-shop.myshopify.com",
      },
    ],
    requiresReauthorizationInstallations: [],
    failedInstallations: [],
  });
});

test("continues refreshing the batch and reports individual failures", async () => {
  const candidates = [
    makeCandidate("platform-account-1", "first-shop.myshopify.com"),
    makeCandidate("platform-account-2", "second-shop.myshopify.com"),
    makeCandidate("platform-account-3", null),
  ];
  const attemptedAccountIds: string[] = [];

  const result = await maintainShopifyInstallationTokens(
    {},
    {
      prisma: new FakeShopifyInstallationClient(),
      credentialEncryptionKey: ENCRYPTION_KEY,
      appClientId: "shopify-app-client-id",
      appClientSecret: "shopify-app-client-secret",
      fetchImpl: unexpectedFetch,
      nowFn: () => new Date("2026-06-09T00:00:00.000Z"),
      findCandidatesFn: async () => candidates,
      refreshInstallationTokensFn: async (input) => {
        attemptedAccountIds.push(input.localPlatformAccountId);

        if (input.localPlatformAccountId === "platform-account-1") {
          throw new Error("Shopify refresh request failed.");
        }

        return {
          accessToken: "rotated-access-token",
          installation: candidates[1]!,
        };
      },
    },
  );

  assert.deepEqual(attemptedAccountIds, [
    "platform-account-1",
    "platform-account-2",
  ]);
  assert.deepEqual(result.refreshedInstallations, [
    {
      localPlatformAccountId: "platform-account-2",
      shopDomain: "second-shop.myshopify.com",
    },
  ]);
  assert.deepEqual(result.failedInstallations, [
    {
      localPlatformAccountId: "platform-account-1",
      shopDomain: "first-shop.myshopify.com",
      message: "Shopify refresh request failed.",
    },
    {
      localPlatformAccountId: "platform-account-3",
      shopDomain: null,
      message:
        "Shopify platform account platform-account-3 has no shop domain.",
    },
  ]);
  assert.deepEqual(result.requiresReauthorizationInstallations, []);
});

test("reports installations requiring reauthorization separately from retryable failures", async () => {
  const candidate = makeCandidate(
    "platform-account-1",
    "first-shop.myshopify.com",
  );

  const result = await maintainShopifyInstallationTokens(
    {},
    {
      prisma: new FakeShopifyInstallationClient(),
      credentialEncryptionKey: ENCRYPTION_KEY,
      appClientId: "shopify-app-client-id",
      appClientSecret: "shopify-app-client-secret",
      fetchImpl: unexpectedFetch,
      findCandidatesFn: async () => [candidate],
      refreshInstallationTokensFn: async (input) => {
        throw new ShopifyInstallationRequiresReauthorizationError(
          input.localPlatformAccountId,
          "Shopify rejected its refresh token",
        );
      },
    },
  );

  assert.deepEqual(result.requiresReauthorizationInstallations, [
    {
      localPlatformAccountId: "platform-account-1",
      shopDomain: "first-shop.myshopify.com",
      message:
        "Shopify installation for platform account platform-account-1 requires reauthorization because Shopify rejected its refresh token. Ask the merchant to reopen the app and reconnect Shopify.",
    },
  ]);
  assert.deepEqual(result.failedInstallations, []);
});
