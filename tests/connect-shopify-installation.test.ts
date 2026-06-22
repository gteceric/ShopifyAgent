import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import type {
  PlatformAccount,
  Prisma,
  ShopifyInstallation,
} from "@prisma/client";
import {
  connectShopifyInstallation,
  type ConnectShopifyInstallationClient,
} from "../src/platforms/shopify/auth/connect-installation.js";
import {
  exchangeShopifySessionTokenForOfflineCredentials,
} from "../src/platforms/shopify/auth/exchange-session-token.js";
import {
  SHOPIFY_INSTALLATION_ACTIVE_STATUS,
} from "../src/platforms/shopify/persistence/installation.js";
import {
  decryptCredential,
} from "../src/security/credential-encryption.js";

const APP_CLIENT_ID = "shopify-app-client-id";
const APP_CLIENT_SECRET = "shopify-app-client-secret";
const APP_URL = "https://refund-agent.example.com";
const SHOP_DOMAIN = "merchant-shop.myshopify.com";
const ENCRYPTION_KEY = Buffer.alloc(32, 7);
const NOW = new Date("2026-06-12T00:00:00.000Z");

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function createSignedShopifySessionToken(
  overrides: Record<string, unknown> = {},
): string {
  const currentTimeSeconds = Math.floor(Date.now() / 1_000);
  const header = encodeJson({
    alg: "HS256",
    typ: "JWT",
  });
  const payload = encodeJson({
    iss: `https://${SHOP_DOMAIN}/admin`,
    dest: `https://${SHOP_DOMAIN}`,
    aud: APP_CLIENT_ID,
    sub: "12345",
    exp: currentTimeSeconds + 300,
    nbf: currentTimeSeconds - 10,
    iat: currentTimeSeconds - 10,
    jti: "session-token-id",
    sid: "session-id",
    ...overrides,
  });
  const unsignedToken = `${header}.${payload}`;
  const signature = createHmac("sha256", APP_CLIENT_SECRET)
    .update(unsignedToken)
    .digest("base64url");

  return `${unsignedToken}.${signature}`;
}

function makePlatformAccount(): PlatformAccount {
  return {
    id: "local-platform-account-1",
    platform: "shopify",
    platformAccountId: "gid://shopify/Shop/1",
    name: "Merchant Shop",
    shopDomain: SHOP_DOMAIN,
    rawPayload: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeInstallation(): ShopifyInstallation {
  return {
    id: "shopify-installation-1",
    platformAccountId: "local-platform-account-1",
    status: SHOPIFY_INSTALLATION_ACTIVE_STATUS,
    encryptedAccessToken: "encrypted-access-token",
    encryptedRefreshToken: "encrypted-refresh-token",
    accessTokenExpiresAt: new Date("2026-06-12T01:00:00.000Z"),
    refreshTokenExpiresAt: new Date("2026-09-10T00:00:00.000Z"),
    grantedScopes: ["read_orders"],
    installedAt: NOW,
    uninstalledAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

class FakeConnectShopifyInstallationClient
  implements ConnectShopifyInstallationClient
{
  transactionCount = 0;
  platformAccountUpsertArgs?: Prisma.PlatformAccountUpsertArgs;
  installationUpsertArgs?: Prisma.ShopifyInstallationUpsertArgs;

  private readonly transaction = {
    platformAccount: {
      upsert: async (args: Prisma.PlatformAccountUpsertArgs) => {
        this.platformAccountUpsertArgs = args;

        return makePlatformAccount();
      },
    },
    shopifyInstallation: {
      findUnique: async (_args: Prisma.ShopifyInstallationFindUniqueArgs) =>
        null,
      update: async (_args: Prisma.ShopifyInstallationUpdateArgs) =>
        makeInstallation(),
      upsert: async (args: Prisma.ShopifyInstallationUpsertArgs) => {
        this.installationUpsertArgs = args;

        return makeInstallation();
      },
    },
  };

  async $transaction<T>(
    callback: Parameters<ConnectShopifyInstallationClient["$transaction"]>[0],
  ): Promise<T> {
    this.transactionCount += 1;

    return callback(this.transaction) as Promise<T>;
  }
}

function makeTokenExchangeResponse(): Response {
  return Response.json({
    access_token: "real-offline-access-token",
    expires_in: 3600,
    refresh_token: "real-offline-refresh-token",
    refresh_token_expires_in: 7_776_000,
    scope: "write_orders,read_products,read_customers,read_orders",
  });
}

test("connects or reconnects a Shopify installation using managed token exchange", async () => {
  const prisma = new FakeConnectShopifyInstallationClient();
  const sessionToken = createSignedShopifySessionToken();
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);

    requests.push({ url, init });

    if (url.endsWith("/admin/oauth/access_token")) {
      return makeTokenExchangeResponse();
    }

    return Response.json({
      data: {
        shop: {
          id: "gid://shopify/Shop/1",
          myshopifyDomain: SHOP_DOMAIN,
          name: "Merchant Shop",
        },
      },
    });
  };
  const result = await connectShopifyInstallation(
    {
      sessionToken,
    },
    {
      prisma,
      credentialEncryptionKey: ENCRYPTION_KEY,
      appClientId: APP_CLIENT_ID,
      appClientSecret: APP_CLIENT_SECRET,
      appUrl: APP_URL,
      apiVersion: "2026-01",
      fetchImpl,
      nowFn: () => NOW,
    },
  );

  assert.equal(result.localPlatformAccount.id, "local-platform-account-1");
  assert.equal(result.installation.status, SHOPIFY_INSTALLATION_ACTIVE_STATUS);
  assert.equal(result.shopDomain, SHOP_DOMAIN);
  assert.equal(prisma.transactionCount, 1);
  assert.equal(
    requests[0]?.url,
    `https://${SHOP_DOMAIN}/admin/oauth/access_token`,
  );
  assert.deepEqual(requests[0]?.init?.headers, {
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
  });
  assert.deepEqual(
    Object.fromEntries(new URLSearchParams(String(requests[0]?.init?.body))),
    {
      client_id: APP_CLIENT_ID,
      client_secret: APP_CLIENT_SECRET,
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: sessionToken,
      subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
      requested_token_type:
        "urn:shopify:params:oauth:token-type:offline-access-token",
      expiring: "1",
    },
  );
  assert.equal(
    requests[1]?.url,
    `https://${SHOP_DOMAIN}/admin/api/2026-01/graphql.json`,
  );
  assert.deepEqual(prisma.platformAccountUpsertArgs, {
    where: {
      platform_platformAccountId: {
        platform: "shopify",
        platformAccountId: "gid://shopify/Shop/1",
      },
    },
    create: {
      platform: "shopify",
      platformAccountId: "gid://shopify/Shop/1",
      name: "Merchant Shop",
      shopDomain: SHOP_DOMAIN,
    },
    update: {
      platform: "shopify",
      platformAccountId: "gid://shopify/Shop/1",
      name: "Merchant Shop",
      shopDomain: SHOP_DOMAIN,
    },
  });

  const installationData = prisma.installationUpsertArgs?.update;

  assert.ok(installationData);
  assert.equal(installationData.status, SHOPIFY_INSTALLATION_ACTIVE_STATUS);
  assert.equal(installationData.uninstalledAt, null);
  assert.deepEqual(
    installationData.accessTokenExpiresAt,
    new Date("2026-06-12T01:00:00.000Z"),
  );
  assert.deepEqual(
    installationData.refreshTokenExpiresAt,
    new Date("2026-09-10T00:00:00.000Z"),
  );
  assert.deepEqual(installationData.grantedScopes, [
    "read_customers",
    "read_orders",
    "read_products",
    "write_orders",
  ]);
  assert.equal(
    decryptCredential(
      String(installationData.encryptedAccessToken),
      ENCRYPTION_KEY,
    ),
    "real-offline-access-token",
  );
  assert.equal(
    decryptCredential(
      String(installationData.encryptedRefreshToken),
      ENCRYPTION_KEY,
    ),
    "real-offline-refresh-token",
  );
});

test("rejects an invalid Shopify session token before token exchange", async () => {
  let requestCount = 0;

  await assert.rejects(
    exchangeShopifySessionTokenForOfflineCredentials(
      {
        sessionToken: createSignedShopifySessionToken({
          aud: "different-app-client-id",
        }),
      },
      {
        appClientId: APP_CLIENT_ID,
        appClientSecret: APP_CLIENT_SECRET,
        appUrl: APP_URL,
        fetchImpl: async () => {
          requestCount += 1;

          return makeTokenExchangeResponse();
        },
        nowFn: () => NOW,
      },
    ),
    /Session token had invalid API key/,
  );
  assert.equal(requestCount, 0);
});

test("does not activate an installation when Shopify identity does not match", async () => {
  const prisma = new FakeConnectShopifyInstallationClient();

  await assert.rejects(
    connectShopifyInstallation(
      {
        sessionToken: createSignedShopifySessionToken(),
      },
      {
        prisma,
        credentialEncryptionKey: ENCRYPTION_KEY,
        appClientId: APP_CLIENT_ID,
        appClientSecret: APP_CLIENT_SECRET,
        appUrl: APP_URL,
        apiVersion: "2026-01",
        fetchImpl: async (input) =>
          String(input).endsWith("/admin/oauth/access_token")
            ? makeTokenExchangeResponse()
            : Response.json({
                data: {
                  shop: {
                    id: "gid://shopify/Shop/2",
                    myshopifyDomain: "different-shop.myshopify.com",
                    name: "Different Shop",
                  },
                },
              }),
        nowFn: () => NOW,
      },
    ),
    /Shopify shop identity did not match the authenticated shop domain/,
  );
  assert.equal(prisma.transactionCount, 0);
});
