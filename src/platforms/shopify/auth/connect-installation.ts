import {
  createShopifyAdminClient,
  loadShopifyShopIdentity,
} from "@shopify-agent/core";
import type { PlatformAccount, ShopifyInstallation } from "@prisma/client";
import { encryptCredential } from "../../../security/credential-encryption.js";
import {
  persistShopifyInstallation,
  SHOPIFY_INSTALLATION_ACTIVE_STATUS,
  type ShopifyInstallationClient,
} from "../persistence/installation.js";
import {
  type ShopifyPlatformAccountClient,
  upsertShopifyPlatformAccount,
} from "../persistence/platform-account.js";
import { exchangeShopifySessionTokenForOfflineCredentials } from "./exchange-session-token.js";

export interface ConnectShopifyInstallationInput {
  sessionToken: string;
}

interface ConnectShopifyInstallationTransaction
  extends ShopifyInstallationClient,
    ShopifyPlatformAccountClient {}

export interface ConnectShopifyInstallationClient {
  $transaction<T>(
    callback: (
      transaction: ConnectShopifyInstallationTransaction,
    ) => Promise<T>,
  ): Promise<T>;
}

export interface ConnectShopifyInstallationDependencies {
  prisma: ConnectShopifyInstallationClient;
  credentialEncryptionKey: Buffer;
  appClientId: string;
  appClientSecret: string;
  appUrl: string;
  apiVersion: string;
  fetchImpl: typeof fetch;
  nowFn: () => Date;
}

export interface ConnectShopifyInstallationResult {
  localPlatformAccount: PlatformAccount;
  installation: ShopifyInstallation;
  shopDomain: string;
}

export async function connectShopifyInstallation(
  input: ConnectShopifyInstallationInput,
  dependencies: ConnectShopifyInstallationDependencies,
): Promise<ConnectShopifyInstallationResult> {
  const offlineCredentials =
    await exchangeShopifySessionTokenForOfflineCredentials(input, {
      appClientId: dependencies.appClientId,
      appClientSecret: dependencies.appClientSecret,
      appUrl: dependencies.appUrl,
      fetchImpl: dependencies.fetchImpl,
      nowFn: dependencies.nowFn,
    });
  const shopifyAdminClient = createShopifyAdminClient({
    shopDomain: offlineCredentials.shopDomain,
    accessToken: offlineCredentials.accessToken,
    apiVersion: dependencies.apiVersion,
    fetchImpl: dependencies.fetchImpl,
  });
  const shopIdentity = await loadShopifyShopIdentity(shopifyAdminClient);
  const identityShopDomain = shopIdentity.myshopifyDomain
    .trim()
    .toLowerCase();

  if (identityShopDomain !== offlineCredentials.shopDomain) {
    throw new Error(
      "Shopify shop identity did not match the authenticated shop domain.",
    );
  }

  const installedAt = dependencies.nowFn();

  return dependencies.prisma.$transaction(async (transaction) => {
    const localPlatformAccount = await upsertShopifyPlatformAccount(
      {
        platformAccountId: shopIdentity.id,
        shopDomain: identityShopDomain,
        name: shopIdentity.name,
      },
      transaction,
    );
    const installation = await persistShopifyInstallation(
      {
        localPlatformAccountId: localPlatformAccount.id,
        status: SHOPIFY_INSTALLATION_ACTIVE_STATUS,
        encryptedAccessToken: encryptCredential(
          offlineCredentials.accessToken,
          dependencies.credentialEncryptionKey,
        ),
        encryptedRefreshToken: encryptCredential(
          offlineCredentials.refreshToken,
          dependencies.credentialEncryptionKey,
        ),
        accessTokenExpiresAt: offlineCredentials.accessTokenExpiresAt,
        refreshTokenExpiresAt: offlineCredentials.refreshTokenExpiresAt,
        grantedScopes: offlineCredentials.grantedScopes,
        installedAt,
        uninstalledAt: null,
      },
      transaction,
    );

    return {
      localPlatformAccount,
      installation,
      shopDomain: identityShopDomain,
    };
  });
}
