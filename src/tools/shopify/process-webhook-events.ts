import {
  readOptionalPositiveIntegerEnv,
  readRequiredStringEnv,
} from "@shopify-agent/core";
import { createPrismaClient } from "../../persistence/prisma-client.js";
import { runShopifyWebhookProcessingJob } from "../../platforms/shopify/ops/background-jobs.js";
import { readCredentialEncryptionKey } from "../../security/credential-encryption.js";

const SHOPIFY_TOKEN_ENCRYPTION_KEY_ENV = "SHOPIFY_TOKEN_ENCRYPTION_KEY";

async function main(): Promise<void> {
  const databaseUrl = readRequiredStringEnv("DATABASE_URL");
  const limit = readOptionalPositiveIntegerEnv("SHOPIFY_WEBHOOK_PROCESS_LIMIT");
  const appClientId = readRequiredStringEnv("SHOPIFY_APP_CLIENT_ID");
  const appClientSecret = readRequiredStringEnv("SHOPIFY_APP_CLIENT_SECRET");
  const credentialEncryptionKey = readCredentialEncryptionKey(
    SHOPIFY_TOKEN_ENCRYPTION_KEY_ENV,
  );
  const prisma = createPrismaClient({
    databaseUrl,
  });

  try {
    const lockedRun = await runShopifyWebhookProcessingJob(
      {
        limit,
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
        "Shopify webhook event processing skipped because another run holds the lock.",
      );
      return;
    }

    const result = lockedRun.result;

    if (!result) {
      throw new Error("Shopify webhook event processing did not return a result.");
    }

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
