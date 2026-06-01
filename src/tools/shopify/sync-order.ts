import { createPrismaClient } from "../../persistence/prisma-client.js";
import { syncShopifyOrderSnapshot } from "../../platforms/shopify/sync-order-snapshot.js";

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

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

  const orderId = readRequiredEnv("SYNC_SHOPIFY_ORDER_ID");
  const shopDomain = readRequiredEnv("SHOPIFY_STORE_DOMAIN");
  const prisma = createPrismaClient();

  try {
    const result = await syncShopifyOrderSnapshot(
      {
        orderId,
        shopDomain,
      },
      {
        prisma,
      },
    );

    console.log("Shopify order snapshot synced");
    console.log(
      JSON.stringify(
        {
          orderId,
          platformAccountId: result.platformAccountId,
          localOrderId: result.localOrderId,
          lineItemCount: result.lineItemIdsByPlatformLineItemId.size,
          refundCount: result.refundIdsByPlatformRefundId.size,
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
