import { getErrorMessage, normalizePositiveInteger } from "@shopify-agent/core";
import type { PlatformAccount, PlatformEvent, Prisma } from "@prisma/client";
import {
  PlatformEventStatus,
  type PlatformEventStatusValue,
} from "../../../persistence/platform-event-status.js";
import type { PersistOrderSnapshotResult } from "../../../persistence/persist-order-snapshot.js";
import type { SyncShopifyOrderSnapshotInput } from "../sync/order-snapshot.js";
import { SUPPORTED_SHOPIFY_ORDER_WEBHOOK_TOPICS } from "./ingest-webhook.js";

const SHOPIFY_PLATFORM = "shopify";
const DEFAULT_PROCESS_SHOPIFY_WEBHOOK_EVENT_LIMIT = 25;

export const DEFAULT_SHOPIFY_WEBHOOK_MAX_ATTEMPTS = 5;
export const DEFAULT_SHOPIFY_WEBHOOK_INITIAL_RETRY_DELAY_MS = 60_000;
export const DEFAULT_SHOPIFY_WEBHOOK_MAX_RETRY_DELAY_MS = 60 * 60 * 1000;

export interface ProcessShopifyWebhookEventsClient {
  platformAccount: {
    findUnique(
      args: Prisma.PlatformAccountFindUniqueArgs,
    ): Promise<PlatformAccount | null>;
  };
  platformEvent: {
    findMany(args: Prisma.PlatformEventFindManyArgs): Promise<PlatformEvent[]>;
    update(args: Prisma.PlatformEventUpdateArgs): Promise<PlatformEvent>;
  };
}

export interface ProcessPendingShopifyWebhookEventsInput {
  limit?: number;
  retryPolicy: ShopifyWebhookRetryPolicy;
}

export interface ShopifyWebhookRetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
}

export interface ProcessPendingShopifyWebhookEventsDependencies {
  prisma: ProcessShopifyWebhookEventsClient;
  syncShopifyOrderSnapshotForAccountFn: (
    input: SyncShopifyOrderSnapshotInput,
    localPlatformAccount: PlatformAccount,
  ) => Promise<PersistOrderSnapshotResult>;
  nowFn?: () => Date;
}

export interface ProcessedShopifyWebhookEvent {
  localPlatformEventId: string;
  localOrderId: string;
  platformOrderId: string;
}

export interface FailedShopifyWebhookEvent {
  attemptCount: number;
  localPlatformEventId: string;
  message: string;
  nextAttemptAt?: Date;
  platformOrderId: string;
  status: PlatformEventStatusValue;
}

export interface ProcessPendingShopifyWebhookEventsResult {
  candidateEventCount: number;
  processedEvents: ProcessedShopifyWebhookEvent[];
  failedEvents: FailedShopifyWebhookEvent[];
}

function calculateRetryDelayMs(
  attemptCount: number,
  retryPolicy: ShopifyWebhookRetryPolicy,
): number {
  const retryExponent = Math.min(attemptCount - 1, 52);
  const uncappedDelayMs =
    retryPolicy.initialDelayMs * Math.pow(2, retryExponent);

  return Math.min(uncappedDelayMs, retryPolicy.maxDelayMs);
}

export async function processPendingShopifyWebhookEvents(
  input: ProcessPendingShopifyWebhookEventsInput,
  dependencies: ProcessPendingShopifyWebhookEventsDependencies,
): Promise<ProcessPendingShopifyWebhookEventsResult> {
  const limit = normalizePositiveInteger(
    input.limit ?? DEFAULT_PROCESS_SHOPIFY_WEBHOOK_EVENT_LIMIT,
    "limit",
  );
  const maxAttempts = normalizePositiveInteger(
    input.retryPolicy.maxAttempts,
    "retryPolicy.maxAttempts",
  );
  const initialDelayMs = normalizePositiveInteger(
    input.retryPolicy.initialDelayMs,
    "retryPolicy.initialDelayMs",
  );
  const maxDelayMs = normalizePositiveInteger(
    input.retryPolicy.maxDelayMs,
    "retryPolicy.maxDelayMs",
  );

  if (maxDelayMs < initialDelayMs) {
    throw new Error(
      "retryPolicy.maxDelayMs must be greater than or equal to retryPolicy.initialDelayMs.",
    );
  }

  const retryPolicy: ShopifyWebhookRetryPolicy = {
    maxAttempts,
    initialDelayMs,
    maxDelayMs,
  };
  const processingTime = dependencies.nowFn?.() ?? new Date();
  const pendingShopifyOrderWebhookEventWhere: Prisma.PlatformEventWhereInput = {
    platform: SHOPIFY_PLATFORM,
    eventType: {
      in: [...SUPPORTED_SHOPIFY_ORDER_WEBHOOK_TOPICS],
    },
    resourceType: "order",
    resourceId: {
      not: null,
    },
    platformAccountId: {
      not: null,
    },
    status: {
      in: [PlatformEventStatus.Pending, PlatformEventStatus.Retrying],
    },
    processedAt: null,
    OR: [
      {
        nextAttemptAt: null,
      },
      {
        nextAttemptAt: {
          lte: processingTime,
        },
      },
    ],
  };

  const localPlatformEvents = await dependencies.prisma.platformEvent.findMany({
    where: pendingShopifyOrderWebhookEventWhere,
    orderBy: {
      createdAt: "asc",
    },
    take: limit,
  });
  const processedEvents: ProcessedShopifyWebhookEvent[] = [];
  const failedEvents: FailedShopifyWebhookEvent[] = [];

  if (localPlatformEvents.length === 0) {
    return {
      candidateEventCount: 0,
      processedEvents,
      failedEvents,
    };
  }

  for (const localPlatformEvent of localPlatformEvents) {
    const platformOrderId = localPlatformEvent.resourceId;
    const localPlatformAccountId = localPlatformEvent.platformAccountId;

    if (!platformOrderId || !localPlatformAccountId) {
      continue;
    }

    const attemptCount = localPlatformEvent.attemptCount + 1;

    try {
      const localPlatformAccount =
        await dependencies.prisma.platformAccount.findUnique({
          where: {
            id: localPlatformAccountId,
          },
        });

      if (!localPlatformAccount?.shopDomain) {
        throw new Error(
          `Shopify platform account ${localPlatformAccountId} was not found or has no shop domain.`,
        );
      }

      const orderSnapshotInput: SyncShopifyOrderSnapshotInput = {
        platformOrderId,
        platformAccountId: localPlatformAccount.platformAccountId,
        shopDomain: localPlatformAccount.shopDomain,
      };
      // Fetch latest order data from Shopify and upsert it into Postgres.
      const orderSnapshotResult =
        await dependencies.syncShopifyOrderSnapshotForAccountFn(
          orderSnapshotInput,
          localPlatformAccount,
        );
      // Mark this webhook event as processed
      await dependencies.prisma.platformEvent.update({
        where: {
          id: localPlatformEvent.id,
        },
        data: {
          platformAccountId: orderSnapshotResult.localPlatformAccountId,
          status: PlatformEventStatus.Processed,
          attemptCount,
          lastAttemptAt: processingTime,
          nextAttemptAt: null,
          lastError: null,
          processedAt: processingTime,
        },
      });

      processedEvents.push({
        localPlatformEventId: localPlatformEvent.id,
        localOrderId: orderSnapshotResult.localOrderId,
        platformOrderId,
      });
    } catch (error) {
      const message = getErrorMessage(error);
      const isDeadLetter = attemptCount >= retryPolicy.maxAttempts;
      const status = isDeadLetter
        ? PlatformEventStatus.DeadLetter
        : PlatformEventStatus.Retrying;
      const retryDelayMs = calculateRetryDelayMs(attemptCount, retryPolicy);
      const nextAttemptAt = isDeadLetter
        ? undefined
        : new Date(processingTime.getTime() + retryDelayMs);

      await dependencies.prisma.platformEvent.update({
        where: {
          id: localPlatformEvent.id,
        },
        data: {
          status,
          attemptCount,
          lastAttemptAt: processingTime,
          nextAttemptAt: nextAttemptAt ?? null,
          lastError: message,
        },
      });

      failedEvents.push({
        attemptCount,
        localPlatformEventId: localPlatformEvent.id,
        message,
        ...(nextAttemptAt ? { nextAttemptAt } : {}),
        platformOrderId,
        status,
      });
    }
  }

  return {
    candidateEventCount: localPlatformEvents.length,
    processedEvents,
    failedEvents,
  };
}
