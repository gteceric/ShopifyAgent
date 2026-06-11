import {
  readOptionalPositiveIntegerEnv,
  readRequiredStringEnv,
} from "@shopify-agent/core";
import { createPrismaClient } from "../../persistence/prisma-client.js";
import { runWithPostgresAdvisoryLock } from "../../persistence/postgres-advisory-lock.js";
import {
  findShopifyInstallationsDueForTokenRefresh,
  maintainShopifyInstallationTokens,
} from "../../platforms/shopify/auth/maintain-installation-tokens.js";
import { refreshShopifyInstallationTokens } from "../../platforms/shopify/auth/refresh-installation-tokens.js";
import { readCredentialEncryptionKey } from "../../security/credential-encryption.js";

const SHOPIFY_TOKEN_ENCRYPTION_KEY_ENV = "SHOPIFY_TOKEN_ENCRYPTION_KEY";
const SHOPIFY_TOKEN_MAINTENANCE_LOCK_NAMESPACE_ID = 7_412_009;
const SHOPIFY_TOKEN_MAINTENANCE_LOCK_ID = 1;

async function main(): Promise<void> {
  const databaseUrl = readRequiredStringEnv("DATABASE_URL");
  const appClientId = readRequiredStringEnv("SHOPIFY_APP_CLIENT_ID");
  const appClientSecret = readRequiredStringEnv("SHOPIFY_APP_CLIENT_SECRET");
  const credentialEncryptionKey = readCredentialEncryptionKey(
    SHOPIFY_TOKEN_ENCRYPTION_KEY_ENV,
  );
  const batchSize = readOptionalPositiveIntegerEnv(
    "SHOPIFY_TOKEN_MAINTENANCE_BATCH_SIZE",
  );
  const prisma = createPrismaClient({
    databaseUrl,
  });

  try {
    const lockedRun = await runWithPostgresAdvisoryLock(
      {
        databaseUrl,
        namespaceId: SHOPIFY_TOKEN_MAINTENANCE_LOCK_NAMESPACE_ID,
        lockId: SHOPIFY_TOKEN_MAINTENANCE_LOCK_ID,
      },
      () =>
        maintainShopifyInstallationTokens(
          {
            batchSize,
          },
          {
            prisma,
            credentialEncryptionKey,
            appClientId,
            appClientSecret,
            fetchImpl: fetch,
            findCandidatesFn: (input) =>
              findShopifyInstallationsDueForTokenRefresh(input, prisma),
            refreshInstallationTokensFn: refreshShopifyInstallationTokens,
          },
        ),
    );

    if (!lockedRun.acquired) {
      console.log(
        "Shopify token maintenance skipped because another run holds the lock.",
      );
      return;
    }

    const result = lockedRun.result;

    if (!result) {
      throw new Error("Shopify token maintenance did not return a result.");
    }

    console.log("Shopify token maintenance finished");
    console.log(
      JSON.stringify(
        {
          candidateCount: result.candidateCount,
          refreshBefore: result.refreshBefore.toISOString(),
          refreshedCount: result.refreshedInstallations.length,
          failedCount: result.failedInstallations.length,
          refreshedInstallations: result.refreshedInstallations,
          failedInstallations: result.failedInstallations,
        },
        null,
        2,
      ),
    );

    if (result.failedInstallations.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Failed to maintain Shopify installation tokens.");
  console.error(error);
  process.exitCode = 1;
});
