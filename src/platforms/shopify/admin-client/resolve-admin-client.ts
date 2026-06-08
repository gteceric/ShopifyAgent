import {
  createShopifyAdminClient,
  type ShopifyAdminClient,
} from "@shopify-agent/core";
import type { PlatformAccount } from "@prisma/client";
import {
  findShopifyInstallation,
  SHOPIFY_INSTALLATION_ACTIVE_STATUS,
  type ShopifyInstallationClient,
} from "../persistence/installation.js";
import { decryptCredential } from "../../../security/credential-encryption.js";

const SHOPIFY_PLATFORM = "shopify";

export interface ResolveShopifyAdminClientDependencies {
  prisma: ShopifyInstallationClient;
  credentialEncryptionKey: Buffer;
  apiVersion?: string;
  fetchImpl?: typeof fetch;
  nowFn?: () => Date;
}

export async function resolveShopifyAdminClient(
  localPlatformAccount: PlatformAccount,
  dependencies: ResolveShopifyAdminClientDependencies,
): Promise<ShopifyAdminClient> {
  if (localPlatformAccount.platform !== SHOPIFY_PLATFORM) {
    throw new Error(
      `Platform account ${localPlatformAccount.id} is not a Shopify account.`,
    );
  }

  const shopDomain = localPlatformAccount.shopDomain?.trim();

  if (!shopDomain) {
    throw new Error(
      `Shopify platform account ${localPlatformAccount.id} has no shop domain.`,
    );
  }

  const installation = await findShopifyInstallation(
    localPlatformAccount.id,
    dependencies.prisma,
  );

  if (!installation || installation.status !== SHOPIFY_INSTALLATION_ACTIVE_STATUS) {
    throw new Error(
      `Shopify installation for platform account ${localPlatformAccount.id} is not active.`,
    );
  }

  if (!installation.encryptedAccessToken) {
    throw new Error(
      `Shopify installation for platform account ${localPlatformAccount.id} has no access token.`,
    );
  }

  const now = dependencies.nowFn?.() ?? new Date();

  if (
    installation.accessTokenExpiresAt &&
    installation.accessTokenExpiresAt <= now
  ) {
    throw new Error(
      `Shopify access token for platform account ${localPlatformAccount.id} has expired.`,
    );
  }

  const accessToken = decryptCredential(
    installation.encryptedAccessToken,
    dependencies.credentialEncryptionKey,
  );

  return createShopifyAdminClient({
    shopDomain,
    accessToken,
    apiVersion: dependencies.apiVersion,
    fetchImpl: dependencies.fetchImpl,
  });
}
