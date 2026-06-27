import { readRequiredStringEnv } from "@shopify-agent/core";
import { createPrismaClient } from "../../persistence/prisma-client.js";
import {
  SHOPIFY_INSTALLATION_ACTIVE_STATUS,
  SHOPIFY_INSTALLATION_REQUIRES_REAUTHORIZATION_STATUS,
} from "../../platforms/shopify/persistence/installation.js";

const SHOPIFY_PLATFORM = "shopify";
const REAUTH_TEST_SHOP_DOMAIN_ENV = "SHOPIFY_REAUTH_TEST_SHOP_DOMAIN";

// Development-only UI test helper. This marks one installed shop as requiring
// reauthorization without clearing credentials, so the embedded app can verify
// the reconnect banner and restore the installation through /api/shopify/connect.

function normalizeRequiredShopDomain(value: string): string {
  const shopDomain = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");

  if (!shopDomain) {
    throw new Error(`${REAUTH_TEST_SHOP_DOMAIN_ENV} is required.`);
  }

  if (shopDomain.includes("/")) {
    throw new Error(
      `${REAUTH_TEST_SHOP_DOMAIN_ENV} must be a Shopify shop domain.`,
    );
  }

  return shopDomain;
}

async function main(): Promise<void> {
  const shopDomain = normalizeRequiredShopDomain(
    readRequiredStringEnv(REAUTH_TEST_SHOP_DOMAIN_ENV),
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

    if (
      installation.status ===
      SHOPIFY_INSTALLATION_REQUIRES_REAUTHORIZATION_STATUS
    ) {
      console.log("Shopify installation already requires reauthorization");
      console.log(
        JSON.stringify(
          {
            localPlatformAccountId: localPlatformAccount.id,
            platformAccountId: localPlatformAccount.platformAccountId,
            shopDomain: localPlatformAccount.shopDomain,
            status: installation.status,
            credentialsPreserved: Boolean(
              installation.encryptedAccessToken ||
                installation.encryptedRefreshToken,
            ),
          },
          null,
          2,
        ),
      );
      return;
    }

    if (installation.status !== SHOPIFY_INSTALLATION_ACTIVE_STATUS) {
      throw new Error(
        `Shopify installation for ${shopDomain} is ${installation.status}, not active.`,
      );
    }

    const updatedInstallation = await prisma.shopifyInstallation.update({
      where: {
        platformAccountId: localPlatformAccount.id,
        status: SHOPIFY_INSTALLATION_ACTIVE_STATUS,
      },
      data: {
        status: SHOPIFY_INSTALLATION_REQUIRES_REAUTHORIZATION_STATUS,
      },
    });

    console.log("Shopify installation marked as requiring reauthorization");
    console.log(
      JSON.stringify(
        {
          localPlatformAccountId: localPlatformAccount.id,
          platformAccountId: localPlatformAccount.platformAccountId,
          shopDomain: localPlatformAccount.shopDomain,
          previousStatus: installation.status,
          status: updatedInstallation.status,
          credentialsPreserved: Boolean(
            updatedInstallation.encryptedAccessToken ||
              updatedInstallation.encryptedRefreshToken,
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
  console.error("Failed to mark Shopify installation for reauthorization.");
  console.error(error);
  process.exitCode = 1;
});
