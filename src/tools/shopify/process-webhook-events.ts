import { loadShopifyShopIdentity } from "@shopify-agent/core";
import { createPrismaClient } from "../../persistence/prisma-client.js";
import { syncShopifyOrderSnapshot } from "../../platforms/shopify/sync-order-snapshot.js";
import {
  processPendingShopifyWebhookEvents,
  type ProcessPendingShopifyWebhookEventsDependencies,
  type ProcessPendingShopifyWebhookEventsInput,
} from "../../platforms/shopify/webhooks/process-webhook-events.js";

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

async function main(): Promise<void> {
  const limit = readOptionalPositiveIntegerEnv("SHOPIFY_WEBHOOK_PROCESS_LIMIT");
  const prisma = createPrismaClient();

  try {
    const eventsInput: ProcessPendingShopifyWebhookEventsInput = {
      limit,
    };
    const dependencies: ProcessPendingShopifyWebhookEventsDependencies = {
      prisma,
      loadShopifyShopIdentityFn: () => loadShopifyShopIdentity(),
      syncShopifyOrderSnapshotFn: (orderSnapshotInput) =>
        syncShopifyOrderSnapshot(orderSnapshotInput, {
          prisma,
        }),
    };
    const result = await processPendingShopifyWebhookEvents(
      eventsInput,
      dependencies,
    );

    console.log("Shopify webhook event processing finished");
    console.log(
      JSON.stringify(
        {
          candidateEventCount: result.candidateEventCount,
          processedCount: result.processedEvents.length,
          failedCount: result.failedEvents.length,
          failedEvents: result.failedEvents,
        },
        null,
        2,
      ),
    );

    if (result.failedEvents.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Failed to process Shopify webhook events.");
  console.error(error);
  process.exitCode = 1;
});
