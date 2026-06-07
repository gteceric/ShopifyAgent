import assert from "node:assert/strict";
import test from "node:test";
import type {
  PlatformAccount,
  Prisma,
  ShopifyInstallation,
} from "@prisma/client";
import {
  SHOPIFY_INSTALLATION_ACTIVE_STATUS,
  SHOPIFY_INSTALLATION_INACTIVE_STATUS,
  type ShopifyInstallationClient,
} from "../src/persistence/shopify-installation.js";
import { loadMerchantShopifyAdminClient } from "../src/platforms/shopify/auth/merchant-admin-client.js";
import { encryptShopifyToken } from "../src/platforms/shopify/auth/token-encryption.js";

const ENCRYPTION_KEY = Buffer.alloc(32, 7);

function makePlatformAccount(): PlatformAccount {
  return {
    id: "local-platform-account-1",
    platform: "shopify",
    platformAccountId: "gid://shopify/Shop/1",
    name: null,
    shopDomain: "merchant-shop.myshopify.com",
    rawPayload: null,
    createdAt: new Date("2026-06-07T00:00:00.000Z"),
    updatedAt: new Date("2026-06-07T00:00:00.000Z"),
  };
}

function makeInstallation(
  overrides: Partial<ShopifyInstallation> = {},
): ShopifyInstallation {
  return {
    id: "shopify-installation-1",
    platformAccountId: "local-platform-account-1",
    status: SHOPIFY_INSTALLATION_ACTIVE_STATUS,
    encryptedAccessToken: encryptShopifyToken(
      "merchant-access-token",
      ENCRYPTION_KEY,
    ),
    encryptedRefreshToken: null,
    accessTokenExpiresAt: new Date("2026-06-08T00:00:00.000Z"),
    refreshTokenExpiresAt: null,
    grantedScopes: ["read_orders"],
    installedAt: new Date("2026-06-07T00:00:00.000Z"),
    uninstalledAt: null,
    createdAt: new Date("2026-06-07T00:00:00.000Z"),
    updatedAt: new Date("2026-06-07T00:00:00.000Z"),
    ...overrides,
  };
}

class FakeShopifyInstallationClient implements ShopifyInstallationClient {
  constructor(readonly installation: ShopifyInstallation | null) {}

  readonly shopifyInstallation = {
    findUnique: async (_args: Prisma.ShopifyInstallationFindUniqueArgs) =>
      this.installation,
    update: async (_args: Prisma.ShopifyInstallationUpdateArgs) => {
      assert.ok(this.installation);
      return this.installation;
    },
    upsert: async (_args: Prisma.ShopifyInstallationUpsertArgs) => {
      assert.ok(this.installation);
      return this.installation;
    },
  };
}

test("loads a Shopify Admin client using the merchant installation token", async () => {
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  const client = await loadMerchantShopifyAdminClient(makePlatformAccount(), {
    prisma: new FakeShopifyInstallationClient(makeInstallation()),
    encryptionKey: ENCRYPTION_KEY,
    apiVersion: "2026-01",
    nowFn: () => new Date("2026-06-07T01:00:00.000Z"),
    fetchImpl: async (input, init) => {
      requests.push({ input: String(input), init });

      return new Response(JSON.stringify({ data: { shop: { id: "shop-1" } } }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    },
  });

  await client.fetch("query Shop { shop { id } }", {});

  assert.equal(
    requests[0]?.input,
    "https://merchant-shop.myshopify.com/admin/api/2026-01/graphql.json",
  );
  assert.deepEqual(requests[0]?.init?.headers, {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": "merchant-access-token",
  });
});

test("rejects inactive and expired Shopify installations", async () => {
  const localPlatformAccount = makePlatformAccount();

  await assert.rejects(
    loadMerchantShopifyAdminClient(localPlatformAccount, {
      prisma: new FakeShopifyInstallationClient(
        makeInstallation({
          status: SHOPIFY_INSTALLATION_INACTIVE_STATUS,
        }),
      ),
      encryptionKey: ENCRYPTION_KEY,
    }),
    /is not active\./,
  );
  await assert.rejects(
    loadMerchantShopifyAdminClient(localPlatformAccount, {
      prisma: new FakeShopifyInstallationClient(
        makeInstallation({
          accessTokenExpiresAt: new Date("2026-06-06T00:00:00.000Z"),
        }),
      ),
      encryptionKey: ENCRYPTION_KEY,
      nowFn: () => new Date("2026-06-07T00:00:00.000Z"),
    }),
    /has expired\./,
  );
});
