import { readRequiredStringEnv } from "@shopify-agent/core";
import { createPrismaClient } from "../../persistence/prisma-client.js";
import {
  deactivateShopifyInstallation,
  SHOPIFY_INSTALLATION_INACTIVE_STATUS,
} from "../../platforms/shopify/persistence/installation.js";

const SHOPIFY_PLATFORM = "shopify";
const INACTIVE_TEST_SHOP_DOMAIN_ENV = "SHOPIFY_INACTIVE_TEST_SHOP_DOMAIN";

// Development-only UI test helper. This simulates the local database result of
// an app uninstall by marking one installed shop inactive and clearing stored
// credentials through the same persistence helper used by uninstall webhooks.

function normalizeRequiredShopDomain(value: string): string {
  const shopDomain = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");

  if (!shopDomain) {
    throw new Error(`${INACTIVE_TEST_SHOP_DOMAIN_ENV} is required.`);
  }

  if (shopDomain.includes("/")) {
    throw new Error(
      `${INACTIVE_TEST_SHOP_DOMAIN_ENV} must be a Shopify shop domain.`,
    );
  }

  return shopDomain;
}

async function main(): Promise<void> {
  const shopDomain = normalizeRequiredShopDomain(
    readRequiredStringEnv(INACTIVE_TEST_SHOP_DOMAIN_ENV),
  );
  const prisma = createPrismaClient();

  try {
    const localPlatformAccount = await prisma.platformAccount.findFirst({
      where: {
        platform: SHOPIFY_PLATFORM,
        shopDomain,
      },
      include: {
        shopifyInstallation: true,
      },
    });

    if (!localPlatformAccount) {
      throw new Error(`No Shopify platform account was found for ${shopDomain}.`);
    }

    const installation = localPlatformAccount.shopifyInstallation;

    if (!installation) {
      throw new Error(`No Shopify installation was found for ${shopDomain}.`);
    }

    if (installation.status === SHOPIFY_INSTALLATION_INACTIVE_STATUS) {
      console.log("Shopify installation is already inactive");
      console.log(
        JSON.stringify(
          {
            localPlatformAccountId: localPlatformAccount.id,
            platformAccountId: localPlatformAccount.platformAccountId,
            shopDomain: localPlatformAccount.shopDomain,
            status: installation.status,
            uninstalledAt: installation.uninstalledAt,
            credentialsCleared: !(
              installation.encryptedAccessToken ||
              installation.encryptedRefreshToken
            ),
          },
          null,
          2,
        ),
      );
      return;
    }

    const updatedInstallation = await deactivateShopifyInstallation(
      {
        localPlatformAccountId: localPlatformAccount.id,
        uninstalledAt: new Date(),
      },
      prisma,
    );

    console.log("Shopify installation marked as inactive");
    console.log(
      JSON.stringify(
        {
          localPlatformAccountId: localPlatformAccount.id,
          platformAccountId: localPlatformAccount.platformAccountId,
          shopDomain: localPlatformAccount.shopDomain,
          previousStatus: installation.status,
          status: updatedInstallation.status,
          uninstalledAt: updatedInstallation.uninstalledAt,
          credentialsCleared: !(
            updatedInstallation.encryptedAccessToken ||
            updatedInstallation.encryptedRefreshToken
          ),
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
  console.error("Failed to mark Shopify installation inactive.");
  console.error(error);
  process.exitCode = 1;
});
