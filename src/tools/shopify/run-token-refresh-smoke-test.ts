import {
  loadShopifyShopIdentity,
  readOptionalStringEnv,
  readRequiredStringEnv,
} from "@shopify-agent/core";
import type { PlatformAccount, PrismaClient } from "@prisma/client";
import { createPrismaClient } from "../../persistence/prisma-client.js";
import { resolveShopifyAdminClient } from "../../platforms/shopify/admin-client/resolve-admin-client.js";
import { SHOPIFY_INSTALLATION_ACTIVE_STATUS } from "../../platforms/shopify/persistence/installation.js";
import { readCredentialEncryptionKey } from "../../security/credential-encryption.js";

const SHOPIFY_PLATFORM = "shopify";
const SHOPIFY_TOKEN_ENCRYPTION_KEY_ENV = "SHOPIFY_TOKEN_ENCRYPTION_KEY";
const TOKEN_REFRESH_SMOKE_SHOP_DOMAIN_ENV =
  "SHOPIFY_TOKEN_REFRESH_SMOKE_SHOP_DOMAIN";

// Development-only smoke test. This intentionally mutates one installed shop's
// stored access-token expiry so the normal Admin-client resolver must refresh.

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
    throw new Error(
      `${TOKEN_REFRESH_SMOKE_SHOP_DOMAIN_ENV} must be a Shopify shop domain.`,
    );
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
      `${TOKEN_REFRESH_SMOKE_SHOP_DOMAIN_ENV} is required when multiple Shopify installations exist.`,
    );
  }

  return installations[0]!.platformAccount;
}

async function resolveLocalPlatformAccount(
  prisma: PrismaClient,
): Promise<PlatformAccount> {
  const shopDomain = normalizeOptionalShopDomain(
    readOptionalStringEnv(TOKEN_REFRESH_SMOKE_SHOP_DOMAIN_ENV) ?? undefined,
  );

  if (shopDomain) {
    return resolveLocalPlatformAccountByShopDomain(prisma, shopDomain);
  }

  return resolveOnlyActiveLocalPlatformAccount(prisma);
}

async function main(): Promise<void> {
  const appClientId = readRequiredStringEnv("SHOPIFY_APP_CLIENT_ID");
  const appClientSecret = readRequiredStringEnv("SHOPIFY_APP_CLIENT_SECRET");
  const credentialEncryptionKey = readCredentialEncryptionKey(
    SHOPIFY_TOKEN_ENCRYPTION_KEY_ENV,
  );
  const prisma = createPrismaClient();

  try {
    const localPlatformAccount = await resolveLocalPlatformAccount(prisma);
    const installationBefore = await prisma.shopifyInstallation.findUnique({
      where: {
        platformAccountId: localPlatformAccount.id,
      },
    });

    if (!installationBefore) {
      throw new Error(
        `Shopify installation for platform account ${localPlatformAccount.id} was not found.`,
      );
    }

    if (!installationBefore.encryptedRefreshToken) {
      throw new Error(
        `Shopify installation for ${localPlatformAccount.shopDomain} has no refresh token.`,
      );
    }

    const forcedExpiredAt = new Date(Date.now() - 60_000);

    await prisma.shopifyInstallation.update({
      where: {
        platformAccountId: localPlatformAccount.id,
        status: SHOPIFY_INSTALLATION_ACTIVE_STATUS,
      },
      data: {
        accessTokenExpiresAt: forcedExpiredAt,
      },
    });

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
    const installationAfter = await prisma.shopifyInstallation.findUnique({
      where: {
        platformAccountId: localPlatformAccount.id,
      },
    });

    if (!installationAfter) {
      throw new Error(
        `Shopify installation for platform account ${localPlatformAccount.id} disappeared after refresh.`,
      );
    }

    if (installationAfter.status !== SHOPIFY_INSTALLATION_ACTIVE_STATUS) {
      throw new Error(
        `Shopify installation refresh smoke failed with status ${installationAfter.status}.`,
      );
    }

    if (
      !installationAfter.accessTokenExpiresAt ||
      installationAfter.accessTokenExpiresAt <= new Date()
    ) {
      throw new Error(
        "Shopify token refresh smoke did not store a future access token expiry.",
      );
    }

    console.log("Shopify token refresh smoke test passed");
    console.log(
      JSON.stringify(
        {
          localPlatformAccountId: localPlatformAccount.id,
          platformAccountId: localPlatformAccount.platformAccountId,
          shopDomain: localPlatformAccount.shopDomain,
          shopIdentity,
          previousAccessTokenExpiresAt:
            installationBefore.accessTokenExpiresAt?.toISOString() ?? null,
          forcedAccessTokenExpiresAt: forcedExpiredAt.toISOString(),
          refreshedAccessTokenExpiresAt:
            installationAfter.accessTokenExpiresAt.toISOString(),
          refreshedRefreshTokenExpiresAt:
            installationAfter.refreshTokenExpiresAt?.toISOString() ?? null,
          grantedScopes: installationAfter.grantedScopes,
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
  console.error("Failed to run Shopify token refresh smoke test.");
  console.error(error);
  process.exitCode = 1;
});
