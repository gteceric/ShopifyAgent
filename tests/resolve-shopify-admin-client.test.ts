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
} from "../src/platforms/shopify/persistence/installation.js";
import { resolveShopifyAdminClient } from "../src/platforms/shopify/admin-client/resolve-admin-client.js";
import {
  decryptCredential,
  encryptCredential,
} from "../src/security/credential-encryption.js";

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
    encryptedAccessToken: encryptCredential(
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
  readonly updateArgs: Prisma.ShopifyInstallationUpdateArgs[] = [];

  constructor(readonly installation: ShopifyInstallation | null) {}

  readonly shopifyInstallation = {
    findUnique: async (_args: Prisma.ShopifyInstallationFindUniqueArgs) =>
      this.installation,
    update: async (args: Prisma.ShopifyInstallationUpdateArgs) => {
      this.updateArgs.push(args);
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
  const client = await resolveShopifyAdminClient(makePlatformAccount(), {
    prisma: new FakeShopifyInstallationClient(makeInstallation()),
    credentialEncryptionKey: ENCRYPTION_KEY,
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

test("refreshes an expired access token and uses the rotated credentials", async () => {
  const now = new Date("2026-06-07T00:00:00.000Z");
  const prisma = new FakeShopifyInstallationClient(
    makeInstallation({
      encryptedRefreshToken: encryptCredential(
        "merchant-refresh-token",
        ENCRYPTION_KEY,
      ),
      accessTokenExpiresAt: new Date("2026-06-06T23:59:59.000Z"),
      refreshTokenExpiresAt: new Date("2026-09-07T00:00:00.000Z"),
    }),
  );
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  const client = await resolveShopifyAdminClient(makePlatformAccount(), {
    prisma,
    credentialEncryptionKey: ENCRYPTION_KEY,
    appClientId: "shopify-app-client-id",
    appClientSecret: "shopify-app-client-secret",
    apiVersion: "2026-01",
    nowFn: () => now,
    fetchImpl: async (input, init) => {
      requests.push({ input: String(input), init });

      if (String(input).endsWith("/admin/oauth/access_token")) {
        return new Response(
          JSON.stringify({
            access_token: "rotated-access-token",
            expires_in: 3600,
            refresh_token: "rotated-refresh-token",
            refresh_token_expires_in: 7776000,
            scope: "write_orders,read_orders",
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }

      return new Response(JSON.stringify({ data: { shop: { id: "shop-1" } } }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    },
  });

  await client.fetch("query Shop { shop { id } }", {});

  const refreshRequest = requests[0];
  assert.equal(
    refreshRequest?.input,
    "https://merchant-shop.myshopify.com/admin/oauth/access_token",
  );
  assert.deepEqual(refreshRequest?.init?.headers, {
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
  });
  assert.ok(refreshRequest?.init?.signal);
  assert.equal(
    String(refreshRequest?.init?.body),
    "client_id=shopify-app-client-id&client_secret=shopify-app-client-secret&grant_type=refresh_token&refresh_token=merchant-refresh-token",
  );
  assert.equal(
    requests[1]?.input,
    "https://merchant-shop.myshopify.com/admin/api/2026-01/graphql.json",
  );
  assert.deepEqual(requests[1]?.init?.headers, {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": "rotated-access-token",
  });
  assert.ok(requests[1]?.init?.signal);
  assert.equal(prisma.updateArgs.length, 1);

  const updateData = prisma.updateArgs[0]?.data;
  assert.ok(updateData);
  assert.equal(
    decryptCredential(String(updateData.encryptedAccessToken), ENCRYPTION_KEY),
    "rotated-access-token",
  );
  assert.equal(
    decryptCredential(String(updateData.encryptedRefreshToken), ENCRYPTION_KEY),
    "rotated-refresh-token",
  );
  assert.deepEqual(updateData.accessTokenExpiresAt, new Date("2026-06-07T01:00:00.000Z"));
  assert.deepEqual(
    updateData.refreshTokenExpiresAt,
    new Date("2026-09-05T00:00:00.000Z"),
  );
  assert.deepEqual(updateData.grantedScopes, ["read_orders", "write_orders"]);
});

test("rejects inactive installations and expired refresh tokens", async () => {
  const localPlatformAccount = makePlatformAccount();

  await assert.rejects(
    resolveShopifyAdminClient(localPlatformAccount, {
      prisma: new FakeShopifyInstallationClient(
        makeInstallation({
          status: SHOPIFY_INSTALLATION_INACTIVE_STATUS,
        }),
      ),
      credentialEncryptionKey: ENCRYPTION_KEY,
      fetchImpl: fetch,
    }),
    /is not active\./,
  );
  await assert.rejects(
    resolveShopifyAdminClient(localPlatformAccount, {
      prisma: new FakeShopifyInstallationClient(
        makeInstallation({
          accessTokenExpiresAt: new Date("2026-06-06T00:00:00.000Z"),
          encryptedRefreshToken: encryptCredential(
            "merchant-refresh-token",
            ENCRYPTION_KEY,
          ),
          refreshTokenExpiresAt: new Date("2026-06-06T23:59:59.000Z"),
        }),
      ),
      credentialEncryptionKey: ENCRYPTION_KEY,
      fetchImpl: fetch,
      nowFn: () => new Date("2026-06-07T00:00:00.000Z"),
    }),
    /refresh token .* has expired\./,
  );
});
