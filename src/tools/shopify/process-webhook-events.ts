import { createPrismaClient } from "../../persistence/prisma-client.js";
import { syncShopifyOrderSnapshot } from "../../platforms/shopify/sync/order-snapshot.js";
import { createShopifyWebhookWorkerDependencies } from "../../platforms/shopify/webhooks/create-worker-dependencies.js";
import { readCredentialEncryptionKey } from "../../security/credential-encryption.js";
import {
  processPendingShopifyWebhookEvents,
  type ProcessPendingShopifyWebhookEventsInput,
} from "../../platforms/shopify/webhooks/process-webhook-events.js";

const SHOPIFY_TOKEN_ENCRYPTION_KEY_ENV = "SHOPIFY_TOKEN_ENCRYPTION_KEY";

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
  const credentialEncryptionKey = readCredentialEncryptionKey(
    SHOPIFY_TOKEN_ENCRYPTION_KEY_ENV,
  );

  try {
    const eventsInput: ProcessPendingShopifyWebhookEventsInput = {
      limit,
    };
    const dependencies = createShopifyWebhookWorkerDependencies({
      prisma,
      credentialEncryptionKey,
      apiVersion: process.env.SHOPIFY_API_VERSION,
      syncShopifyOrderSnapshotFn: (orderSnapshotInput, shopifyAdminClient) =>
        syncShopifyOrderSnapshot(orderSnapshotInput, {
          prisma,
          shopifyAdminClient,
        }),
    });
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
