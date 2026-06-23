import type { ShopifyAdminClient } from "@shopify-agent/core";
import { getPrismaClient } from "../../../src/persistence/prisma-client";
import { readCredentialEncryptionKey } from "../../../src/security/credential-encryption";
import { resolveDashboardShopifyAdminClient } from "./dashboard-order-summaries";
import {
  readShopifyApiVersion,
  readShopifyAppClientId,
  readShopifyAppClientSecret,
} from "./shopify-app-env";

const SHOPIFY_TOKEN_ENCRYPTION_KEY_ENV = "SHOPIFY_TOKEN_ENCRYPTION_KEY";

export async function resolveCurrentShopifyAdminClient(
  shopDomain: string | null,
): Promise<ShopifyAdminClient> {
  const realShopifyAdminClientDependencies = {
    prisma: getPrismaClient(),
    credentialEncryptionKey: readCredentialEncryptionKey(
      SHOPIFY_TOKEN_ENCRYPTION_KEY_ENV,
    ),
    appClientId: readShopifyAppClientId(),
    appClientSecret: readShopifyAppClientSecret(),
    apiVersion: readShopifyApiVersion(),
    fetchImpl: fetch,
    nowFn: () => new Date(),
  };

  return resolveDashboardShopifyAdminClient(
    { shopDomain },
    realShopifyAdminClientDependencies,
  );
}

export function requireResolvedShopifyAdminClient(
  shopifyAdminClient: ShopifyAdminClient | undefined,
): ShopifyAdminClient {
  if (!shopifyAdminClient) {
    throw new Error("Real Shopify dashboard requires ShopifyAdminClient.");
  }

  return shopifyAdminClient;
}
