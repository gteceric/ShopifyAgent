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

function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();

  return value ? value : undefined;
}

function readOptionalPositiveIntegerEnv(name: string): number | undefined {
  const value = process.env[name]?.trim();

  if (!value) {
    return undefined;
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsedValue;
}

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
  const platform = readOptionalEnv("RECONCILE_PLATFORM") ?? "shopify";
  const limit = readOptionalPositiveIntegerEnv("RECONCILE_ORDER_LIMIT");
  const shopifyAdminClient = createShopifyAdminClientFromEnv();
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
