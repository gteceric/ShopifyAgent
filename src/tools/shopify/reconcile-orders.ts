import {
  readOptionalPositiveIntegerEnv,
  readOptionalStringEnv,
} from "@shopify-agent/core";
import { createPrismaClient } from "../../persistence/prisma-client.js";
import { createShopifyAdminClientFromEnv } from "../../platforms/shopify/admin-client/env-admin-client.js";
import {
  createShopifyReconcileOrdersDependencies,
  loadShopifyReconciliationInput,
} from "../../platforms/shopify/sync/reconcile-orders-adapter.js";
import {
  reconcileOrders,
  type PlatformReconciliationInput,
  type ReconcileOrdersInput,
} from "../../sync/reconcile-orders.js";

async function loadPlatformReconciliationInput(
  platform: string,
  shopifyAdminClient: ReturnType<typeof createShopifyAdminClientFromEnv>,
): Promise<PlatformReconciliationInput> {
  switch (platform) {
    case "shopify":
      return loadShopifyReconciliationInput(shopifyAdminClient);

    default:
      throw new Error(
        `No reconciliation CLI adapter is configured for ${platform}.`,
      );
  }
}

async function main(): Promise<void> {
  const platform = readOptionalStringEnv("RECONCILE_PLATFORM") ?? "shopify";
  const limit = readOptionalPositiveIntegerEnv("RECONCILE_ORDER_LIMIT");
  const shopifyAdminClient = createShopifyAdminClientFromEnv(fetch);
  const platformInput = await loadPlatformReconciliationInput(
    platform,
    shopifyAdminClient,
  );
  const prisma = createPrismaClient();
  const reconcileInput: ReconcileOrdersInput = {
    platform,
    platformAccountId: platformInput.platformAccountId,
    platformAccountData: platformInput.platformAccountData,
    platformContext: platformInput.platformContext,
    limit,
  };
  const reconcileDependencies =
    createShopifyReconcileOrdersDependencies(prisma, shopifyAdminClient);

  try {
    const result = await reconcileOrders(reconcileInput, reconcileDependencies);

    console.log("Shopify order reconciliation finished");
    console.log(
      JSON.stringify(
        {
          localSyncRunId: result.localSyncRunId,
          localPlatformAccountId: result.localPlatformAccountId,
          status: result.status,
          candidateOrderCount: result.candidateOrderCount,
          syncedCount: result.syncedOrders.length,
          failedCount: result.failedOrders.length,
          failedOrders: result.failedOrders,
        },
        null,
        2,
      ),
    );

    if (result.status === "failed") {
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
