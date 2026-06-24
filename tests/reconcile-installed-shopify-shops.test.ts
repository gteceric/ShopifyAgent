import assert from "node:assert/strict";
import test from "node:test";
import type {
  PlatformAccount,
  Prisma,
  PrismaClient,
  ShopifyInstallation,
  SyncRun,
} from "@prisma/client";
import { reconcileInstalledShopifyShops } from "../src/platforms/shopify/sync/reconcile-installed-shops.js";
import { SHOPIFY_INSTALLATION_ACTIVE_STATUS } from "../src/platforms/shopify/persistence/installation.js";
import { encryptCredential } from "../src/security/credential-encryption.js";

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
    createdAt: new Date("2026-06-22T00:00:00.000Z"),
    updatedAt: new Date("2026-06-22T00:00:00.000Z"),
  };
}

function makeInstallation(
  id: string,
  platformAccount: PlatformAccount,
  accessToken: string,
): ShopifyInstallation & { platformAccount: PlatformAccount } {
  return {
    id,
    platformAccountId: platformAccount.id,
    status: SHOPIFY_INSTALLATION_ACTIVE_STATUS,
    encryptedAccessToken: encryptCredential(accessToken, ENCRYPTION_KEY),
    encryptedRefreshToken: null,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
    grantedScopes: ["read_orders"],
    installedAt: new Date("2026-06-22T00:00:00.000Z"),
    uninstalledAt: null,
    createdAt: new Date("2026-06-22T00:00:00.000Z"),
    updatedAt: new Date("2026-06-22T00:00:00.000Z"),
    platformAccount,
  };
}

class FakeReconcileInstalledShopifyShopsPrisma {
  readonly platformAccountUpserts: Prisma.PlatformAccountUpsertArgs[] = [];
  readonly syncRunCreates: Prisma.SyncRunCreateArgs[] = [];
  readonly syncRunUpdates: Prisma.SyncRunUpdateArgs[] = [];
  shopifyInstallationFindManyArgs?: Prisma.ShopifyInstallationFindManyArgs;

  constructor(
    readonly platformAccounts: PlatformAccount[],
    readonly installations: Array<
      ShopifyInstallation & { platformAccount: PlatformAccount }
    >,
  ) {}

  readonly shopifyInstallation = {
    findMany: async (args: Prisma.ShopifyInstallationFindManyArgs) => {
      this.shopifyInstallationFindManyArgs = args;

      return this.installations;
    },
    findUnique: async (args: Prisma.ShopifyInstallationFindUniqueArgs) =>
      this.installations.find(
        (installation) =>
          installation.platformAccountId === args.where.platformAccountId,
      ) ?? null,
    update: async (_args: Prisma.ShopifyInstallationUpdateArgs) => {
      throw new Error("Unexpected installation update.");
    },
    upsert: async (_args: Prisma.ShopifyInstallationUpsertArgs) => {
      throw new Error("Unexpected installation upsert.");
    },
  };

  readonly platformAccount = {
    upsert: async (args: Prisma.PlatformAccountUpsertArgs) => {
      this.platformAccountUpserts.push(args);

      const platformAccountId =
        args.where.platform_platformAccountId?.platformAccountId;
      const localPlatformAccount = this.platformAccounts.find(
        (account) => account.platformAccountId === platformAccountId,
      );

      assert.ok(localPlatformAccount);

      return localPlatformAccount;
    },
  };

  readonly syncRun = {
    create: async (args: Prisma.SyncRunCreateArgs) => {
      this.syncRunCreates.push(args);

      return {
        id: `sync-run-${this.syncRunCreates.length}`,
        platformAccountId: String(args.data.platformAccountId),
        platform: String(args.data.platform),
        syncType: String(args.data.syncType),
        status: String(args.data.status),
        startedAt: args.data.startedAt as Date,
        finishedAt: null,
        summary: args.data.summary as Prisma.JsonValue,
      } as SyncRun;
    },
    update: async (args: Prisma.SyncRunUpdateArgs) => {
      this.syncRunUpdates.push(args);

      return {
        id: String(args.where.id),
        platformAccountId: "local-platform-account",
        platform: "shopify",
        syncType: "order_reconciliation",
        status: String(args.data.status),
        startedAt: new Date("2026-06-22T00:00:00.000Z"),
        finishedAt: args.data.finishedAt as Date,
        summary: args.data.summary as Prisma.JsonValue,
      } as SyncRun;
    },
  };
}

test("reconciles each installed Shopify shop with its stored merchant token", async () => {
  const previousUseRealShopify = process.env.USE_REAL_SHOPIFY;
  process.env.USE_REAL_SHOPIFY = "true";

  try {
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
    const prisma = new FakeReconcileInstalledShopifyShopsPrisma(
      [firstAccount, secondAccount],
      [
        makeInstallation("installation-1", firstAccount, "first-access-token"),
        makeInstallation("installation-2", secondAccount, "second-access-token"),
      ],
    );
    const requests: Array<{
      accessToken: string;
      query: string;
      url: string;
    }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      const body = JSON.parse(String(init?.body)) as { query: string };
      const url = String(input);
      const shopDomain = new URL(url).hostname;

      requests.push({
        accessToken: headers.get("X-Shopify-Access-Token") ?? "",
        query: body.query,
        url,
      });

      if (body.query.includes("ShopifyShopIdentity")) {
        const account =
          shopDomain === firstAccount.shopDomain ? firstAccount : secondAccount;

        return Response.json({
          data: {
            shop: {
              id: account.platformAccountId,
              myshopifyDomain: account.shopDomain,
              name: `${account.shopDomain} name`,
            },
          },
        });
      }

      if (body.query.includes("ShopifyOrdersList")) {
        return Response.json({
          data: {
            orders: {
              nodes: [],
            },
          },
        });
      }

      throw new Error(`Unexpected Shopify query: ${body.query}`);
    };

    const result = await reconcileInstalledShopifyShops(
      {
        orderLimit: 9,
        shopLimit: 2,
      },
      {
        prisma: prisma as unknown as PrismaClient,
        credentialEncryptionKey: ENCRYPTION_KEY,
        appClientId: "shopify-app-client-id",
        appClientSecret: "shopify-app-client-secret",
        apiVersion: "2026-01",
        fetchImpl,
      },
    );

    assert.deepEqual(prisma.shopifyInstallationFindManyArgs, {
      where: {
        status: SHOPIFY_INSTALLATION_ACTIVE_STATUS,
        platformAccount: {
          platform: "shopify",
        },
      },
      include: {
        platformAccount: true,
      },
      orderBy: {
        installedAt: "asc",
      },
      take: 2,
    });
    assert.deepEqual(
      requests.map((request) => ({
        accessToken: request.accessToken,
        url: request.url,
      })),
      [
        {
          accessToken: "first-access-token",
          url: "https://first-shop.myshopify.com/admin/api/2026-01/graphql.json",
        },
        {
          accessToken: "first-access-token",
          url: "https://first-shop.myshopify.com/admin/api/2026-01/graphql.json",
        },
        {
          accessToken: "second-access-token",
          url: "https://second-shop.myshopify.com/admin/api/2026-01/graphql.json",
        },
        {
          accessToken: "second-access-token",
          url: "https://second-shop.myshopify.com/admin/api/2026-01/graphql.json",
        },
      ],
    );
    assert.deepEqual(
      prisma.syncRunCreates.map((args) => args.data.platformAccountId),
      ["local-platform-account-1", "local-platform-account-2"],
    );
    assert.equal(result.candidateInstallationCount, 2);
    assert.equal(result.reconciledInstallations.length, 2);
    assert.deepEqual(result.failedInstallations, []);
    assert.deepEqual(
      result.reconciledInstallations.map((installation) => ({
        platformAccountId: installation.platformAccountId,
        status: installation.reconciliation.status,
        candidateOrderCount: installation.reconciliation.candidateOrderCount,
      })),
      [
        {
          platformAccountId: "gid://shopify/Shop/1",
          status: "succeeded",
          candidateOrderCount: 0,
        },
        {
          platformAccountId: "gid://shopify/Shop/2",
          status: "succeeded",
          candidateOrderCount: 0,
        },
      ],
    );
  } finally {
    if (previousUseRealShopify === undefined) {
      delete process.env.USE_REAL_SHOPIFY;
    } else {
      process.env.USE_REAL_SHOPIFY = previousUseRealShopify;
    }
  }
});
