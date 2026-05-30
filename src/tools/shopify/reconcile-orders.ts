import { loadOrders, loadShopifyShopIdentity } from "@shopify-agent/core";
import { createPrismaClient } from "../../persistence/prisma-client.js";
import {
  reconcileOrders,
  type ReconcileOrderSnapshotInput,
  type ReconcileOrdersDependencies,
  type ReconcileOrdersInput,
  type ReconcilePlatformAccountData,
} from "../../sync/reconcile-orders.js";
import { syncShopifyOrderSnapshot } from "../../platforms/shopify/sync-order-snapshot.js";

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required to reconcile Shopify orders.`);
  }

  return value;
}

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

async function loadShopifyReconciliationInput(): Promise<{
  platformAccountId: string;
  platformAccountData: ReconcilePlatformAccountData;
  platformContext: {
    shopDomain: string;
  };
}> {
  if (process.env.USE_REAL_SHOPIFY !== "true") {
    throw new Error(
      "Shopify order reconciliation requires USE_REAL_SHOPIFY=true.",
    );
  }

  const shopIdentity = await loadShopifyShopIdentity();

  return {
    platformAccountId: shopIdentity.id,
    platformAccountData: {
      name: shopIdentity.name,
      shopDomain: shopIdentity.myshopifyDomain,
    },
    platformContext: {
      shopDomain: shopIdentity.myshopifyDomain,
    },
  };
}

async function loadPlatformReconciliationInput(platform: string): Promise<{
  platformAccountId: string;
  platformAccountData?: ReconcilePlatformAccountData;
  platformContext?: {
    shopDomain: string;
  };
}> {
  switch (platform) {
    case "shopify":
      return loadShopifyReconciliationInput();

    default:
      throw new Error(
        `No reconciliation CLI adapter is configured for ${platform}.`,
      );
  }
}

function readShopDomainFromSyncInput(
  input: ReconcileOrderSnapshotInput,
): string {
  const shopDomain = input.platformContext?.shopDomain;

  if (typeof shopDomain !== "string" || shopDomain.trim() === "") {
    throw new Error("shopDomain is required to reconcile Shopify orders.");
  }

  return shopDomain;
}

async function main(): Promise<void> {
  const platform = readOptionalEnv("RECONCILE_PLATFORM") ?? "shopify";
  const limit = readOptionalPositiveIntegerEnv("RECONCILE_ORDER_LIMIT");
  const platformInput = await loadPlatformReconciliationInput(platform);
  const prisma = createPrismaClient();
  const reconcileInput: ReconcileOrdersInput = {
    platform,
    platformAccountId: platformInput.platformAccountId,
    platformAccountData: platformInput.platformAccountData,
    platformContext: platformInput.platformContext,
    limit,
  };
  const reconcileDependencies: ReconcileOrdersDependencies = {
    prisma,
    loadOrderCandidatesFn: async (loadInput) => loadOrders(loadInput),
    syncOrderSnapshotFn: async (syncInput) => {
      const shopDomain = readShopDomainFromSyncInput(syncInput);
      const shopifySyncInput = {
        orderId: syncInput.orderId,
        shopDomain,
        syncedAt: syncInput.syncedAt,
      };
      const shopifySyncDependencies = {
        prisma,
      };

      return syncShopifyOrderSnapshot(
        shopifySyncInput,
        shopifySyncDependencies,
      );
    },
  };

  try {
    const result = await reconcileOrders(reconcileInput, reconcileDependencies);

    console.log("Shopify order reconciliation finished");
    console.log(
      JSON.stringify(
        {
          syncRunId: result.syncRunId,
          platformAccountId: result.platformAccountId,
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
