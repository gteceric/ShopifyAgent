import assert from "node:assert/strict";
import test from "node:test";
import {
  FinancialStatus,
  FulfillmentStatus,
} from "@shopify-agent/core";
import type {
  PlatformAccount,
  Prisma,
  ShopifyInstallation,
} from "@prisma/client";
import {
  loadDashboardOrderSummaries,
  resolveDashboardShopifyAdminClient,
} from "../app/dashboard-order-summaries";
import { encryptCredential } from "../../../src/security/credential-encryption";

const ENCRYPTION_KEY = Buffer.alloc(32, 9);

function makePlatformAccount(): PlatformAccount {
  return {
    id: "platform-account-1",
    platform: "shopify",
    platformAccountId: "gid://shopify/Shop/1",
    name: "CommerceOps Dev",
    shopDomain: "commerceops-dev.myshopify.com",
    rawPayload: null,
    createdAt: new Date("2026-06-19T00:00:00.000Z"),
    updatedAt: new Date("2026-06-19T00:00:00.000Z"),
  };
}

function makeShopifyInstallation(): ShopifyInstallation {
  return {
    id: "shopify-installation-1",
    platformAccountId: "platform-account-1",
    status: "active",
    encryptedAccessToken: encryptCredential(
      "merchant-access-token",
      ENCRYPTION_KEY,
    ),
    encryptedRefreshToken: encryptCredential(
      "merchant-refresh-token",
      ENCRYPTION_KEY,
    ),
    accessTokenExpiresAt: new Date("2026-06-19T01:00:00.000Z"),
    refreshTokenExpiresAt: new Date("2026-09-17T00:00:00.000Z"),
    grantedScopes: [
      "read_customers",
      "read_orders",
      "read_products",
      "read_returns",
      "write_orders",
    ],
    installedAt: new Date("2026-06-19T00:00:00.000Z"),
    uninstalledAt: null,
    createdAt: new Date("2026-06-19T00:00:00.000Z"),
    updatedAt: new Date("2026-06-19T00:00:00.000Z"),
  };
}

class FakeDashboardOrderSummariesClient {
  platformAccountFindFirstArgs?: Prisma.PlatformAccountFindFirstArgs;

  platformAccount = {
    findFirst: async (args: Prisma.PlatformAccountFindFirstArgs) => {
      this.platformAccountFindFirstArgs = args;

      return makePlatformAccount();
    },
  };

  shopifyInstallation = {
    findUnique: async () => makeShopifyInstallation(),
    update: async () => makeShopifyInstallation(),
    upsert: async () => makeShopifyInstallation(),
  };
}

test("loads real dashboard order summaries with the stored installation token", async () => {
  const prisma = new FakeDashboardOrderSummariesClient();
  const requests: Array<{ input: string; init?: RequestInit }> = [];

  const shopifyAdminClient = await resolveDashboardShopifyAdminClient(
    {
      shopDomain: " CommerceOps-Dev.MyShopify.com ",
    },
    {
      prisma,
      credentialEncryptionKey: ENCRYPTION_KEY,
      appClientId: "shopify-app-client-id",
      appClientSecret: "shopify-app-client-secret",
      apiVersion: "2026-01",
      fetchImpl: async (input, init) => {
        requests.push({ input: String(input), init });

        return Response.json({
          data: {
            orders: {
              nodes: [
                {
                  id: "gid://shopify/Order/123",
                  name: "#1001",
                  createdAt: "2026-06-18T00:00:00.000Z",
                  totalPriceSet: {
                    shopMoney: {
                      amount: "42.50",
                    },
                  },
                  displayFinancialStatus: "PAID",
                  displayFulfillmentStatus: "FULFILLED",
                  transactions: [],
                  customer: {
                    displayName: "Ada Lovelace",
                  },
                },
              ],
            },
          },
        });
      },
      nowFn: () => new Date("2026-06-19T00:30:00.000Z"),
    },
  );
  const orders = await loadDashboardOrderSummaries(
    {
      limit: 2,
      shopDomain: " CommerceOps-Dev.MyShopify.com ",
      useRealShopify: true,
    },
    {
      realShopify: {
        shopifyAdminClient,
      },
    },
  );

  assert.equal(
    prisma.platformAccountFindFirstArgs?.where?.shopDomain,
    "commerceops-dev.myshopify.com",
  );
  assert.deepEqual(prisma.platformAccountFindFirstArgs?.orderBy, {
    updatedAt: "desc",
  });
  assert.equal(
    requests[0]?.input,
    "https://commerceops-dev.myshopify.com/admin/api/2026-01/graphql.json",
  );
  assert.deepEqual(requests[0]?.init?.headers, {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": "merchant-access-token",
  });
  assert.equal(JSON.parse(String(requests[0]?.init?.body)).variables.first, 2);
  assert.deepEqual(orders, [
    {
      id: "gid://shopify/Order/123",
      name: "#1001",
      customerName: "Ada Lovelace",
      createdAt: "2026-06-18T00:00:00.000Z",
      totalAmount: 42.5,
      financialStatus: FinancialStatus.Paid,
      fulfillmentStatus: FulfillmentStatus.Fulfilled,
    },
  ]);
});
