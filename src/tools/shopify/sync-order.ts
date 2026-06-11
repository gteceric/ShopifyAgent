import {
  loadShopifyShopIdentity,
  readOptionalStringEnv,
} from "@shopify-agent/core";
import { createPrismaClient } from "../../persistence/prisma-client.js";
import { createShopifyAdminClientFromEnv } from "../../platforms/shopify/admin-client/env-admin-client.js";
import { syncShopifyOrderSnapshot } from "../../platforms/shopify/sync/order-snapshot.js";

function readRequiredEnv(name: string): string {
  const value = readOptionalStringEnv(name);

  if (!value) {
    throw new Error(`${name} is required to sync a Shopify order snapshot.`);
  }

  return value;
}

function requireRealShopifySyncFlag(): void {
  if (process.env.USE_REAL_SHOPIFY !== "true") {
    throw new Error(
      "Shopify order snapshot sync requires USE_REAL_SHOPIFY=true.",
    );
  }
}

async function main(): Promise<void> {
  requireRealShopifySyncFlag();

  const platformOrderId = readRequiredEnv("SYNC_SHOPIFY_ORDER_ID");
  const shopifyAdminClient = createShopifyAdminClientFromEnv(fetch);
  const shopIdentity = await loadShopifyShopIdentity(shopifyAdminClient);
  const prisma = createPrismaClient();

  try {
    const result = await syncShopifyOrderSnapshot(
      {
        platformOrderId,
        platformAccountId: shopIdentity.id,
        shopDomain: shopIdentity.myshopifyDomain,
      },
      {
        prisma,
        shopifyAdminClient,
      },
    );

    console.log("Shopify order snapshot synced");
    console.log(
      JSON.stringify(
        {
          platformOrderId,
          localPlatformAccountId: result.localPlatformAccountId,
          localOrderId: result.localOrderId,
          lineItemCount: result.lineItemCount,
          refundCount: result.refundCount,
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
  console.error("Failed to sync Shopify order snapshot.");
  console.error(error);
  process.exitCode = 1;
});
