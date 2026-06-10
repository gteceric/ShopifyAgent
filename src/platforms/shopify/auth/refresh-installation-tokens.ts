import { requireNotExpired } from "@shopify-agent/core";
import type { ShopifyInstallation } from "@prisma/client";
import {
  decryptCredential,
  encryptCredential,
} from "../../../security/credential-encryption.js";
import {
  type ShopifyInstallationClient,
  type UpdateShopifyInstallationTokensInput,
  updateShopifyInstallationTokens,
} from "../persistence/installation.js";
import { refreshShopifyOfflineToken } from "./refresh-offline-token.js";

export interface RefreshShopifyInstallationTokensInput {
  localPlatformAccountId: string;
  shopDomain: string;
  encryptedRefreshToken: string;
  refreshTokenExpiresAt: Date | null;
}

export interface RefreshShopifyInstallationTokensDependencies {
  prisma: ShopifyInstallationClient;
  credentialEncryptionKey: Buffer;
  appClientId: string;
  appClientSecret: string;
  fetchImpl?: typeof fetch;
  nowFn?: () => Date;
}

export interface RefreshShopifyInstallationTokensResult {
  accessToken: string;
  installation: ShopifyInstallation;
}

export async function refreshShopifyInstallationTokens(
  input: RefreshShopifyInstallationTokensInput,
  dependencies: RefreshShopifyInstallationTokensDependencies,
): Promise<RefreshShopifyInstallationTokensResult> {
  const now = dependencies.nowFn?.() ?? new Date();

  requireNotExpired(input.refreshTokenExpiresAt, now, () => {
    return new Error(
      `Shopify refresh token for platform account ${input.localPlatformAccountId} has expired.`,
    );
  });

  const refreshToken = decryptCredential(
    input.encryptedRefreshToken,
    dependencies.credentialEncryptionKey,
  );
  const refreshedToken = await refreshShopifyOfflineToken(
    {
      shopDomain: input.shopDomain,
      clientId: dependencies.appClientId,
      clientSecret: dependencies.appClientSecret,
      refreshToken,
    },
    dependencies.fetchImpl,
  );
  const updateShopifyInstallationTokensInput: UpdateShopifyInstallationTokensInput =
    {
      localPlatformAccountId: input.localPlatformAccountId,
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
  const installation = await updateShopifyInstallationTokens(
    updateShopifyInstallationTokensInput,
    dependencies.prisma,
  );

  return {
    accessToken: refreshedToken.accessToken,
    installation,
  };
}
