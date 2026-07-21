import type { PrismaClient } from "@prisma/client";
import { runWithPostgresAdvisoryLock } from "../../../persistence/postgres-advisory-lock.js";
import { syncShopifyOrderSnapshot } from "../sync/order-snapshot.js";
import {
  reconcileInstalledShopifyShops,
  type ReconcileInstalledShopifyShopsResult,
} from "../sync/reconcile-installed-shops.js";
import { createShopifyWebhookWorkerDependencies } from "../webhooks/create-worker-dependencies.js";
import {
  processPendingShopifyWebhookEvents,
  type ProcessPendingShopifyWebhookEventsResult,
  type ShopifyWebhookRetryPolicy,
} from "../webhooks/process-webhook-events.js";

const SHOPIFY_WEBHOOK_PROCESSING_LOCK_NAMESPACE_ID = 7_412_009;
const SHOPIFY_WEBHOOK_PROCESSING_LOCK_ID = 2;
const SHOPIFY_RECONCILIATION_LOCK_NAMESPACE_ID = 7_412_009;
const SHOPIFY_RECONCILIATION_LOCK_ID = 3;

export interface ShopifyBackgroundJobDependencies {
  databaseUrl: string;
  prisma: PrismaClient;
  credentialEncryptionKey: Buffer;
  appClientId: string;
  appClientSecret: string;
  apiVersion?: string;
  fetchImpl: typeof fetch;
  nowFn?: () => Date;
}

export interface ShopifyWebhookProcessingJobInput {
  limit?: number;
  retryPolicy: ShopifyWebhookRetryPolicy;
}

export interface ShopifyReconciliationJobInput {
  orderLimit?: number;
  shopLimit?: number;
}

export interface LockedShopifyBackgroundJobResult<TResult> {
  lockAcquired: boolean;
  result?: TResult;
}

export async function runShopifyWebhookProcessingJob(
  input: ShopifyWebhookProcessingJobInput,
  dependencies: ShopifyBackgroundJobDependencies,
): Promise<
  LockedShopifyBackgroundJobResult<ProcessPendingShopifyWebhookEventsResult>
> {
  const lockedRun = await runWithPostgresAdvisoryLock(
    {
      databaseUrl: dependencies.databaseUrl,
      namespaceId: SHOPIFY_WEBHOOK_PROCESSING_LOCK_NAMESPACE_ID,
      lockId: SHOPIFY_WEBHOOK_PROCESSING_LOCK_ID,
    },
    () => {
      const webhookProcessingInput = {
        limit: input.limit,
        retryPolicy: input.retryPolicy,
      };
      const webhookProcessingDependencies =
        createShopifyWebhookWorkerDependencies({
          prisma: dependencies.prisma,
          credentialEncryptionKey: dependencies.credentialEncryptionKey,
          appClientId: dependencies.appClientId,
          appClientSecret: dependencies.appClientSecret,
          apiVersion: dependencies.apiVersion,
          fetchImpl: dependencies.fetchImpl,
          nowFn: dependencies.nowFn,
          syncShopifyOrderSnapshotWithClientFn: (
            orderSnapshotInput,
            shopifyAdminClient,
          ) =>
            syncShopifyOrderSnapshot(orderSnapshotInput, {
              prisma: dependencies.prisma,
              shopifyAdminClient,
            }),
        });

      return processPendingShopifyWebhookEvents(
        webhookProcessingInput,
        webhookProcessingDependencies,
      );
    },
  );

  return {
    lockAcquired: lockedRun.acquired,
    result: lockedRun.result,
  };
}

export async function runShopifyReconciliationJob(
  input: ShopifyReconciliationJobInput,
  dependencies: ShopifyBackgroundJobDependencies,
): Promise<
  LockedShopifyBackgroundJobResult<ReconcileInstalledShopifyShopsResult>
> {
  const lockedRun = await runWithPostgresAdvisoryLock(
    {
      databaseUrl: dependencies.databaseUrl,
      namespaceId: SHOPIFY_RECONCILIATION_LOCK_NAMESPACE_ID,
      lockId: SHOPIFY_RECONCILIATION_LOCK_ID,
    },
    () =>
      reconcileInstalledShopifyShops(
        {
          orderLimit: input.orderLimit,
          shopLimit: input.shopLimit,
        },
        {
          prisma: dependencies.prisma,
          credentialEncryptionKey: dependencies.credentialEncryptionKey,
          appClientId: dependencies.appClientId,
          appClientSecret: dependencies.appClientSecret,
          apiVersion: dependencies.apiVersion,
          fetchImpl: dependencies.fetchImpl,
          nowFn: dependencies.nowFn,
        },
      ),
  );

  return {
    lockAcquired: lockedRun.acquired,
    result: lockedRun.result,
  };
}
