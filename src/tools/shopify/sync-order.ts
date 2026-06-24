import {
  loadShopifyShopIdentity,
  readOptionalStringEnv,
  readRequiredStringEnv,
} from "@shopify-agent/core";
import type { PlatformAccount, PrismaClient } from "@prisma/client";
import { createPrismaClient } from "../../persistence/prisma-client.js";
import { resolveShopifyAdminClient } from "../../platforms/shopify/admin-client/resolve-admin-client.js";
import { SHOPIFY_INSTALLATION_ACTIVE_STATUS } from "../../platforms/shopify/persistence/installation.js";
import { syncShopifyOrderSnapshot } from "../../platforms/shopify/sync/order-snapshot.js";
import { readCredentialEncryptionKey } from "../../security/credential-encryption.js";

const SHOPIFY_PLATFORM = "shopify";
const SHOPIFY_TOKEN_ENCRYPTION_KEY_ENV = "SHOPIFY_TOKEN_ENCRYPTION_KEY";

// Development-only manual tool. The app, webhook worker, and reconciliation
// runner use their own production entrypoints and do not call this file.

// example:
// USE_REAL_SHOPIFY=true \
// SYNC_SHOPIFY_SHOP_DOMAIN=commerceops-dev.myshopify.com \
// SYNC_SHOPIFY_ORDER_ID="gid://shopify/Order/1234567890" \
// npm run sync-shopify-order

function requireRealShopifySyncFlag(): void {
  if (process.env.USE_REAL_SHOPIFY !== "true") {
    throw new Error(
      "Shopify order snapshot sync requires USE_REAL_SHOPIFY=true.",
    );
  }
}

function normalizeOptionalShopDomain(value: string | undefined): string | null {
  const shopDomain = value
    ?.trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");

  if (!shopDomain) {
    return null;
  }

  if (shopDomain.includes("/")) {
    throw new Error("SYNC_SHOPIFY_SHOP_DOMAIN must be a Shopify shop domain.");
  }

  return shopDomain;
}

async function resolveLocalPlatformAccountByShopDomain(
  prisma: PrismaClient,
  shopDomain: string,
): Promise<PlatformAccount> {
  const localPlatformAccount = await prisma.platformAccount.findFirst({
    where: {
      platform: SHOPIFY_PLATFORM,
      shopDomain,
      shopifyInstallation: {
        status: SHOPIFY_INSTALLATION_ACTIVE_STATUS,
      },
    },
  });

  if (!localPlatformAccount) {
    throw new Error(
      `No active Shopify installation was found for ${shopDomain}.`,
    );
  }

  return localPlatformAccount;
}

async function resolveOnlyActiveLocalPlatformAccount(
  prisma: PrismaClient,
): Promise<PlatformAccount> {
  const installations = await prisma.shopifyInstallation.findMany({
    where: {
      status: SHOPIFY_INSTALLATION_ACTIVE_STATUS,
      platformAccount: {
        platform: SHOPIFY_PLATFORM,
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

  if (installations.length === 0) {
    throw new Error("No active Shopify installation was found.");
  }

  if (installations.length > 1) {
    throw new Error(
      "SYNC_SHOPIFY_SHOP_DOMAIN is required when multiple Shopify installations exist.",
    );
  }

  return installations[0]!.platformAccount;
}

async function resolveLocalPlatformAccount(
  prisma: PrismaClient,
): Promise<PlatformAccount> {
  const shopDomain = normalizeOptionalShopDomain(
    readOptionalStringEnv("SYNC_SHOPIFY_SHOP_DOMAIN") ??
      readOptionalStringEnv("SHOPIFY_STORE_DOMAIN") ??
      undefined,
  );

  if (shopDomain) {
    return resolveLocalPlatformAccountByShopDomain(prisma, shopDomain);
  }

  return resolveOnlyActiveLocalPlatformAccount(prisma);
}

async function main(): Promise<void> {
  requireRealShopifySyncFlag();

  const platformOrderId = readRequiredStringEnv("SYNC_SHOPIFY_ORDER_ID");
  const credentialEncryptionKey = readCredentialEncryptionKey(
    SHOPIFY_TOKEN_ENCRYPTION_KEY_ENV,
  );
  const appClientId = readRequiredStringEnv("SHOPIFY_APP_CLIENT_ID");
  const appClientSecret = readRequiredStringEnv("SHOPIFY_APP_CLIENT_SECRET");
  const prisma = createPrismaClient();

  try {
    const localPlatformAccount = await resolveLocalPlatformAccount(prisma);
    const shopifyAdminClient = await resolveShopifyAdminClient(
      localPlatformAccount,
      {
        prisma,
        credentialEncryptionKey,
        appClientId,
        appClientSecret,
        apiVersion: process.env.SHOPIFY_API_VERSION,
        fetchImpl: fetch,
      },
    );
    const shopIdentity = await loadShopifyShopIdentity(shopifyAdminClient);

    if (shopIdentity.id !== localPlatformAccount.platformAccountId) {
      throw new Error(
        `Shopify shop identity does not match platform account ${localPlatformAccount.id}.`,
      );
    }

    const result = await syncShopifyOrderSnapshot(
      {
        platformOrderId,
        platformAccountId: shopIdentity.id,
        shopDomain: shopIdentity.myshopifyDomain,
      },
      {
        prisma,
        shopifyAdminClient,
      },
    );

    console.log("Shopify order snapshot synced");
    console.log(
      JSON.stringify(
        {
          platformOrderId,
          localPlatformAccountId: result.localPlatformAccountId,
          shopDomain: shopIdentity.myshopifyDomain,
          localOrderId: result.localOrderId,
          lineItemCount: result.lineItemCount,
          refundCount: result.refundCount,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Failed to sync Shopify order snapshot.");
  console.error(error);
  process.exitCode = 1;
});
