import {
  createShopifyAdminClient,
  isExpired,
  type ShopifyAdminClient,
} from "@shopify-agent/core";
import type { PlatformAccount } from "@prisma/client";
import {
  findShopifyInstallation,
  SHOPIFY_INSTALLATION_ACTIVE_STATUS,
  SHOPIFY_INSTALLATION_INACTIVE_STATUS,
  SHOPIFY_INSTALLATION_REQUIRES_REAUTHORIZATION_STATUS,
  ShopifyInstallationInactiveError,
  ShopifyInstallationRequiresReauthorizationError,
  type ShopifyInstallationClient,
  updateShopifyInstallationToRequireReauthorization,
} from "../persistence/installation.js";
import { decryptCredential } from "../../../security/credential-encryption.js";
import { refreshShopifyInstallationTokens } from "../auth/refresh-installation-tokens.js";

const SHOPIFY_PLATFORM = "shopify";

export interface ResolveShopifyAdminClientDependencies {
  prisma: ShopifyInstallationClient;
  credentialEncryptionKey: Buffer;
  appClientId?: string;
  appClientSecret?: string;
  apiVersion?: string;
  fetchImpl: typeof fetch;
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

  if (!installation) {
    throw new Error(
      `Shopify installation for platform account ${localPlatformAccount.id} is not active.`,
    );
  }

  switch (installation.status) {
    case SHOPIFY_INSTALLATION_ACTIVE_STATUS:
      break;
    case SHOPIFY_INSTALLATION_INACTIVE_STATUS:
      throw new ShopifyInstallationInactiveError(localPlatformAccount.id);
    case SHOPIFY_INSTALLATION_REQUIRES_REAUTHORIZATION_STATUS:
      throw new ShopifyInstallationRequiresReauthorizationError(
        localPlatformAccount.id,
        "its stored credentials are no longer valid",
      );
    default:
      throw new Error(
        `Shopify installation for platform account ${localPlatformAccount.id} is not active.`,
      );
  }

  const now = dependencies.nowFn?.() ?? new Date();
  const accessTokenExpired = isExpired(installation.accessTokenExpiresAt, now);
  let accessToken: string;

  if (accessTokenExpired) {
    if (!installation.encryptedRefreshToken) {
      await updateShopifyInstallationToRequireReauthorization(
        {
          localPlatformAccountId: localPlatformAccount.id,
        },
        dependencies.prisma,
      );

      throw new ShopifyInstallationRequiresReauthorizationError(
        localPlatformAccount.id,
        "it has no refresh token",
      );
    }

    const refreshResult = await refreshShopifyInstallationTokens(
      {
        localPlatformAccountId: localPlatformAccount.id,
        shopDomain,
        encryptedRefreshToken: installation.encryptedRefreshToken,
        refreshTokenExpiresAt: installation.refreshTokenExpiresAt,
      },
      {
        prisma: dependencies.prisma,
        credentialEncryptionKey: dependencies.credentialEncryptionKey,
        appClientId: dependencies.appClientId ?? "",
        appClientSecret: dependencies.appClientSecret ?? "",
        fetchImpl: dependencies.fetchImpl,
        nowFn: () => now,
      },
    );

    accessToken = refreshResult.accessToken;
  } else if (installation.encryptedAccessToken) {
    accessToken = decryptCredential(
      installation.encryptedAccessToken,
      dependencies.credentialEncryptionKey,
    );
  } else {
    throw new Error(
      `Shopify installation for platform account ${localPlatformAccount.id} has no access token.`,
    );
  }

  return createShopifyAdminClient({
    shopDomain,
    accessToken,
    apiVersion: dependencies.apiVersion,
    fetchImpl: dependencies.fetchImpl,
  });
}
