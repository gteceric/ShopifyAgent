import {
  readOptionalPositiveIntegerEnv,
  readOptionalStringEnv,
  readRequiredStringEnv,
} from "@shopify-agent/core";
import { createPrismaClient } from "../../persistence/prisma-client.js";
import { runShopifyReconciliationJob } from "../../platforms/shopify/ops/background-jobs.js";
import { readCredentialEncryptionKey } from "../../security/credential-encryption.js";

const SHOPIFY_TOKEN_ENCRYPTION_KEY_ENV = "SHOPIFY_TOKEN_ENCRYPTION_KEY";

function requireShopifyReconciliationPlatform(): void {
  const platform = readOptionalStringEnv("RECONCILE_PLATFORM") ?? "shopify";

  if (platform !== "shopify") {
    throw new Error(
      `No reconciliation CLI adapter is configured for ${platform}.`,
    );
  }
}

async function main(): Promise<void> {
  requireShopifyReconciliationPlatform();

  const databaseUrl = readRequiredStringEnv("DATABASE_URL");
  const limit = readOptionalPositiveIntegerEnv("RECONCILE_ORDER_LIMIT");
  const shopLimit = readOptionalPositiveIntegerEnv("RECONCILE_SHOP_LIMIT");
  const appClientId = readRequiredStringEnv("SHOPIFY_APP_CLIENT_ID");
  const appClientSecret = readRequiredStringEnv("SHOPIFY_APP_CLIENT_SECRET");
  const credentialEncryptionKey = readCredentialEncryptionKey(
    SHOPIFY_TOKEN_ENCRYPTION_KEY_ENV,
  );
  const prisma = createPrismaClient({
    databaseUrl,
  });

  try {
    const lockedRun = await runShopifyReconciliationJob(
      {
        orderLimit: limit,
        shopLimit,
      },
      {
        databaseUrl,
        prisma,
        credentialEncryptionKey,
        appClientId,
        appClientSecret,
        apiVersion: process.env.SHOPIFY_API_VERSION,
        fetchImpl: fetch,
      },
    );

    if (!lockedRun.lockAcquired) {
      console.log(
        "Shopify installed-shop reconciliation skipped because another run holds the lock.",
      );
      return;
    }

    const result = lockedRun.result;

    if (!result) {
      throw new Error("Shopify installed-shop reconciliation did not return a result.");
    }

    const failedReconciliationCount = result.reconciledInstallations.filter(
      (installation) => installation.reconciliation.status === "failed",
    ).length;

    console.log("Shopify installed-shop reconciliation finished");
    console.log(
      JSON.stringify(
        {
          candidateInstallationCount: result.candidateInstallationCount,
          reconciledCount: result.reconciledInstallations.length,
          failedInstallationCount: result.failedInstallations.length,
          failedReconciliationCount,
          reconciledInstallations: result.reconciledInstallations.map(
            (installation) => ({
              localSyncRunId: installation.reconciliation.localSyncRunId,
              localPlatformAccountId:
                installation.reconciliation.localPlatformAccountId,
              platformAccountId: installation.platformAccountId,
              shopDomain: installation.shopDomain,
              status: installation.reconciliation.status,
              candidateOrderCount:
                installation.reconciliation.candidateOrderCount,
              syncedCount: installation.reconciliation.syncedOrders.length,
              failedCount: installation.reconciliation.failedOrders.length,
              failedOrders: installation.reconciliation.failedOrders,
            }),
          ),
          failedInstallations: result.failedInstallations,
        },
        null,
        2,
      ),
    );

    if (
      result.failedInstallations.length > 0 ||
      failedReconciliationCount > 0
    ) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Failed to reconcile Shopify orders.");
  console.error(error);
  process.exitCode = 1;
});
