import {
  getErrorMessage,
  readOptionalPositiveIntegerEnv,
  readOptionalStringEnv,
  readRequiredStringEnv,
} from "@shopify-agent/core";
import { createPrismaClient } from "../../persistence/prisma-client.js";
import {
  runShopifyReconciliationJob,
  runShopifyWebhookProcessingJob,
  type LockedShopifyBackgroundJobResult,
  type ShopifyBackgroundJobDependencies,
} from "../../platforms/shopify/ops/background-jobs.js";
import type { ReconcileInstalledShopifyShopsResult } from "../../platforms/shopify/sync/reconcile-installed-shops.js";
import type {
  ProcessPendingShopifyWebhookEventsResult,
  ShopifyWebhookRetryPolicy,
} from "../../platforms/shopify/webhooks/process-webhook-events.js";
import { readCredentialEncryptionKey } from "../../security/credential-encryption.js";
import { readShopifyWebhookRetryPolicy } from "./read-webhook-retry-policy.js";

const SHOPIFY_TOKEN_ENCRYPTION_KEY_ENV = "SHOPIFY_TOKEN_ENCRYPTION_KEY";
const DEFAULT_WEBHOOK_PROCESS_INTERVAL_MS = 10_000; // every 10 seconds
const DEFAULT_RECONCILIATION_INTERVAL_MS = 15 * 60 * 1000; // every 15 mins

interface WorkerJobController {
  stop(): void;
  waitForIdle(): Promise<void>;
}

interface ScheduleRecurringJobInput {
  intervalMs: number;
  jobName: string;
  runImmediately: boolean;
  runJobFn: () => Promise<void>;
}

interface ShopifyBackgroundWorkerConfig {
  webhookProcessIntervalMs: number;
  reconciliationIntervalMs: number;
  webhookProcessLimit?: number;
  webhookRetryPolicy: ShopifyWebhookRetryPolicy;
  reconcileOrderLimit?: number;
  reconcileShopLimit?: number;
  runImmediately: boolean;
}

function readOptionalBooleanEnv(name: string, defaultValue: boolean): boolean {
  const value = readOptionalStringEnv(name);

  if (value === undefined) {
    return defaultValue;
  }

  switch (value.toLowerCase()) {
    case "true":
    case "1":
    case "yes":
      return true;
    case "false":
    case "0":
    case "no":
      return false;
    default:
      throw new Error(`${name} must be true or false when set.`);
  }
}

function readPositiveIntegerEnvWithDefault(
  name: string,
  defaultValue: number,
): number {
  return readOptionalPositiveIntegerEnv(name) ?? defaultValue;
}

function readShopifyBackgroundWorkerConfig(): ShopifyBackgroundWorkerConfig {
  return {
    webhookProcessIntervalMs: readPositiveIntegerEnvWithDefault(
      "SHOPIFY_WEBHOOK_PROCESS_INTERVAL_MS",
      DEFAULT_WEBHOOK_PROCESS_INTERVAL_MS,
    ),
    reconciliationIntervalMs: readPositiveIntegerEnvWithDefault(
      "SHOPIFY_RECONCILIATION_INTERVAL_MS",
      DEFAULT_RECONCILIATION_INTERVAL_MS,
    ),
    webhookProcessLimit: readOptionalPositiveIntegerEnv(
      "SHOPIFY_WEBHOOK_PROCESS_LIMIT",
    ),
    webhookRetryPolicy: readShopifyWebhookRetryPolicy(),
    reconcileOrderLimit: readOptionalPositiveIntegerEnv(
      "RECONCILE_ORDER_LIMIT",
    ),
    reconcileShopLimit: readOptionalPositiveIntegerEnv("RECONCILE_SHOP_LIMIT"),
    runImmediately: readOptionalBooleanEnv(
      "SHOPIFY_BACKGROUND_WORKER_RUN_IMMEDIATELY",
      true,
    ),
  };
}

function writeWorkerLog(
  level: "error" | "info" | "warn",
  event: string,
  data: Record<string, unknown> = {},
): void {
  const logEntry = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...data,
  };
  const serializedLogEntry = JSON.stringify(logEntry);

  if (level === "error") {
    console.error(serializedLogEntry);
  } else {
    console.log(serializedLogEntry);
  }
}

function countFailedReconciliations(
  result: ReconcileInstalledShopifyShopsResult,
): number {
  return result.reconciledInstallations.filter(
    (installation) => installation.reconciliation.status === "failed",
  ).length;
}

function summarizeWebhookProcessingJob(
  lockedRun: LockedShopifyBackgroundJobResult<ProcessPendingShopifyWebhookEventsResult>,
): Record<string, unknown> {
  if (!lockedRun.lockAcquired) {
    return {
      lockAcquired: false,
    };
  }

  const result = lockedRun.result;

  if (!result) {
    throw new Error("Shopify webhook processing job did not return a result.");
  }

  return {
    lockAcquired: true,
    candidateEventCount: result.candidateEventCount,
    processedCount: result.processedEvents.length,
    failedCount: result.failedEvents.length,
    failedEvents: result.failedEvents,
  };
}

function getWebhookProcessingJobLogLevel(
  lockedRun: LockedShopifyBackgroundJobResult<ProcessPendingShopifyWebhookEventsResult>,
): "info" | "warn" {
  if (!lockedRun.lockAcquired) {
    return "warn";
  }

  return lockedRun.result && lockedRun.result.failedEvents.length > 0
    ? "warn"
    : "info";
}

function summarizeReconciliationJob(
  lockedRun: LockedShopifyBackgroundJobResult<ReconcileInstalledShopifyShopsResult>,
): Record<string, unknown> {
  if (!lockedRun.lockAcquired) {
    return {
      lockAcquired: false,
    };
  }

  const result = lockedRun.result;

  if (!result) {
    throw new Error("Shopify reconciliation job did not return a result.");
  }

  return {
    lockAcquired: true,
    candidateInstallationCount: result.candidateInstallationCount,
    reconciledCount: result.reconciledInstallations.length,
    failedInstallationCount: result.failedInstallations.length,
    failedReconciliationCount: countFailedReconciliations(result),
    failedInstallations: result.failedInstallations,
  };
}

function getReconciliationJobLogLevel(
  lockedRun: LockedShopifyBackgroundJobResult<ReconcileInstalledShopifyShopsResult>,
): "info" | "warn" {
  if (!lockedRun.lockAcquired) {
    return "warn";
  }

  return lockedRun.result &&
    (lockedRun.result.failedInstallations.length > 0 ||
      countFailedReconciliations(lockedRun.result) > 0)
    ? "warn"
    : "info";
}

function scheduleRecurringJob(
  input: ScheduleRecurringJobInput,
): WorkerJobController {
  let stopped = false;
  let running = false;
  let timer: NodeJS.Timeout | undefined;

  const runAndScheduleNext = async () => {
    if (stopped) {
      return;
    }

    running = true;
    writeWorkerLog("info", "shopify_background_job_started", {
      jobName: input.jobName,
    });

    try {
      await input.runJobFn();
      writeWorkerLog("info", "shopify_background_job_finished", {
        jobName: input.jobName,
      });
    } catch (error) {
      writeWorkerLog("error", "shopify_background_job_failed", {
        jobName: input.jobName,
        message: getErrorMessage(error),
      });
    } finally {
      running = false;

      if (!stopped) {
        timer = setTimeout(runAndScheduleNext, input.intervalMs);
      }
    }
  };

  if (input.runImmediately) {
    timer = setTimeout(runAndScheduleNext, 0);
  } else {
    timer = setTimeout(runAndScheduleNext, input.intervalMs);
  }

  return {
    stop: () => {
      stopped = true;

      if (timer) {
        clearTimeout(timer);
      }
    },
    waitForIdle: async () => {
      while (running) {
        await new Promise((resolve) => {
          setTimeout(resolve, 100);
        });
      }
    },
  };
}

async function main(): Promise<void> {
  const config = readShopifyBackgroundWorkerConfig();
  const databaseUrl = readRequiredStringEnv("DATABASE_URL");
  const appClientId = readRequiredStringEnv("SHOPIFY_APP_CLIENT_ID");
  const appClientSecret = readRequiredStringEnv("SHOPIFY_APP_CLIENT_SECRET");
  const credentialEncryptionKey = readCredentialEncryptionKey(
    SHOPIFY_TOKEN_ENCRYPTION_KEY_ENV,
  );
  const prisma = createPrismaClient({
    databaseUrl,
  });
  const dependencies: ShopifyBackgroundJobDependencies = {
    databaseUrl,
    prisma,
    credentialEncryptionKey,
    appClientId,
    appClientSecret,
    apiVersion: process.env.SHOPIFY_API_VERSION,
    fetchImpl: fetch,
  };
  const jobControllers: WorkerJobController[] = [
    scheduleRecurringJob({
      jobName: "shopify_webhook_processing",
      intervalMs: config.webhookProcessIntervalMs,
      runImmediately: config.runImmediately,
      runJobFn: async () => {
        const lockedRun = await runShopifyWebhookProcessingJob(
          {
            limit: config.webhookProcessLimit,
            retryPolicy: config.webhookRetryPolicy,
          },
          dependencies,
        );
        const jobSummary = summarizeWebhookProcessingJob(lockedRun);

        writeWorkerLog(
          getWebhookProcessingJobLogLevel(lockedRun),
          "shopify_webhook_processing_summary",
          jobSummary,
        );
      },
    }),
    scheduleRecurringJob({
      jobName: "shopify_reconciliation",
      intervalMs: config.reconciliationIntervalMs,
      runImmediately: config.runImmediately,
      runJobFn: async () => {
        const lockedRun = await runShopifyReconciliationJob(
          {
            orderLimit: config.reconcileOrderLimit,
            shopLimit: config.reconcileShopLimit,
          },
          dependencies,
        );
        const jobSummary = summarizeReconciliationJob(lockedRun);

        writeWorkerLog(
          getReconciliationJobLogLevel(lockedRun),
          "shopify_reconciliation_summary",
          jobSummary,
        );
      },
    }),
  ];

  writeWorkerLog("info", "shopify_background_worker_started", {
    webhookProcessIntervalMs: config.webhookProcessIntervalMs,
    reconciliationIntervalMs: config.reconciliationIntervalMs,
    webhookProcessLimit: config.webhookProcessLimit,
    webhookRetryPolicy: config.webhookRetryPolicy,
    reconcileOrderLimit: config.reconcileOrderLimit,
    reconcileShopLimit: config.reconcileShopLimit,
    runImmediately: config.runImmediately,
  });

  const shutdown = () => {
    writeWorkerLog("info", "shopify_background_worker_stopping");

    for (const jobController of jobControllers) {
      jobController.stop();
    }

    void Promise.all(
      jobControllers.map((jobController) => jobController.waitForIdle()),
    )
      .then(() => prisma.$disconnect())
      .then(() => {
        writeWorkerLog("info", "shopify_background_worker_stopped");
        process.exit(0);
      })
      .catch((error: unknown) => {
        writeWorkerLog("error", "shopify_background_worker_shutdown_failed", {
          message: getErrorMessage(error),
        });
        process.exit(1);
      });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  writeWorkerLog("error", "shopify_background_worker_start_failed", {
    message: getErrorMessage(error),
  });
  process.exitCode = 1;
});
