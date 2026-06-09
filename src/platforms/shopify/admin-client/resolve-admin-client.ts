import {
  createShopifyAdminClient,
  type ShopifyAdminClient,
} from "@shopify-agent/core";
import type { PlatformAccount } from "@prisma/client";
import {
  findShopifyInstallation,
  SHOPIFY_INSTALLATION_ACTIVE_STATUS,
  type ShopifyInstallationClient,
  type UpdateShopifyInstallationTokensInput,
  updateShopifyInstallationTokens,
} from "../persistence/installation.js";
import {
  decryptCredential,
  encryptCredential,
} from "../../../security/credential-encryption.js";
import { refreshShopifyOfflineToken } from "../auth/refresh-offline-token.js";

const SHOPIFY_PLATFORM = "shopify";

export interface ResolveShopifyAdminClientDependencies {
  prisma: ShopifyInstallationClient;
  credentialEncryptionKey: Buffer;
  appClientId?: string;
  appClientSecret?: string;
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

  if (
    !installation ||
    installation.status !== SHOPIFY_INSTALLATION_ACTIVE_STATUS
  ) {
    throw new Error(
      `Shopify installation for platform account ${localPlatformAccount.id} is not active.`,
    );
  }

  // check if token is expired
  const now = dependencies.nowFn?.() ?? new Date();
  const accessTokenExpired =
    installation.accessTokenExpiresAt &&
    installation.accessTokenExpiresAt <= now;
  let accessToken: string;

  if (accessTokenExpired) {
    if (!installation.encryptedRefreshToken) {
      throw new Error(
        `Shopify installation for platform account ${localPlatformAccount.id} has no refresh token.`,
      );
    }

    const refreshTokenExpired =
      installation.refreshTokenExpiresAt &&
      installation.refreshTokenExpiresAt < now;

    if (refreshTokenExpired) {
      throw new Error(
        `Shopify refresh token for platform account ${localPlatformAccount.id} has expired.`,
      );
    }

    const refreshToken = decryptCredential(
      installation.encryptedRefreshToken,
      dependencies.credentialEncryptionKey,
    );
    const refreshedToken = await refreshShopifyOfflineToken(
      {
        shopDomain,
        clientId: dependencies.appClientId ?? "",
        clientSecret: dependencies.appClientSecret ?? "",
        refreshToken,
      },
      dependencies.fetchImpl,
    );
    const updateShopifyInstallationTokensInput: UpdateShopifyInstallationTokensInput =
      {
        localPlatformAccountId: localPlatformAccount.id,
        encryptedAccessToken: encryptCredential(
          refreshedToken.accessToken,
          dependencies.credentialEncryptionKey,
        ),
        encryptedRefreshToken: encryptCredential(
          refreshedToken.refreshToken,
          dependencies.credentialEncryptionKey,
        ),
        accessTokenExpiresAt: new Date(
          now.getTime() + refreshedToken.accessTokenExpiresInSeconds * 1_000,
        ),
        refreshTokenExpiresAt: new Date(
          now.getTime() + refreshedToken.refreshTokenExpiresInSeconds * 1_000,
        ),
        grantedScopes: refreshedToken.grantedScopes,
      };

    await updateShopifyInstallationTokens(
      updateShopifyInstallationTokensInput,
      dependencies.prisma,
    );

    accessToken = refreshedToken.accessToken;
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
