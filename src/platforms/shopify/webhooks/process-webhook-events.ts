import type { PlatformEvent, Prisma } from "@prisma/client";
import type { ShopifyShopIdentity } from "@shopify-agent/core";
import type { PersistOrderSnapshotResult } from "../../../persistence/persist-order-snapshot.js";
import type { SyncShopifyOrderSnapshotInput } from "../sync-order-snapshot.js";
import { SUPPORTED_SHOPIFY_ORDER_WEBHOOK_TOPICS } from "./receive-webhook.js";

const SHOPIFY_PLATFORM = "shopify";
const DEFAULT_PROCESS_SHOPIFY_WEBHOOK_EVENT_LIMIT = 25;

export interface ProcessShopifyWebhookEventsClient {
  platformEvent: {
    findMany(args: Prisma.PlatformEventFindManyArgs): Promise<PlatformEvent[]>;
    update(args: Prisma.PlatformEventUpdateArgs): Promise<PlatformEvent>;
  };
}

export interface ProcessPendingShopifyWebhookEventsInput {
  limit?: number;
}

export interface ProcessPendingShopifyWebhookEventsDependencies {
  prisma: ProcessShopifyWebhookEventsClient;
  loadShopifyShopIdentityFn: () => Promise<ShopifyShopIdentity>;
  syncShopifyOrderSnapshotFn: (
    input: SyncShopifyOrderSnapshotInput,
  ) => Promise<PersistOrderSnapshotResult>;
  nowFn?: () => Date;
}

export interface ProcessedShopifyWebhookEvent {
  localPlatformEventId: string;
  localOrderId: string;
  platformOrderId: string;
}

export interface FailedShopifyWebhookEvent {
  localPlatformEventId: string;
  message: string;
  platformOrderId: string;
}

export interface ProcessPendingShopifyWebhookEventsResult {
  candidateEventCount: number;
  processedEvents: ProcessedShopifyWebhookEvent[];
  failedEvents: FailedShopifyWebhookEvent[];
}

function normalizeLimit(limit?: number): number {
  if (limit === undefined) {
    return DEFAULT_PROCESS_SHOPIFY_WEBHOOK_EVENT_LIMIT;
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("limit must be a positive integer.");
  }

  return limit;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function processPendingShopifyWebhookEvents(
  input: ProcessPendingShopifyWebhookEventsInput,
  dependencies: ProcessPendingShopifyWebhookEventsDependencies,
): Promise<ProcessPendingShopifyWebhookEventsResult> {
  const limit = normalizeLimit(input.limit);
  const pendingShopifyOrderWebhookEventWhere: Prisma.PlatformEventWhereInput = {
    platform: SHOPIFY_PLATFORM,
    eventType: {
      in: [...SUPPORTED_SHOPIFY_ORDER_WEBHOOK_TOPICS],
    },
    resourceType: "order",
    resourceId: {
      not: null,
    },
    processedAt: null,
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

  const shopIdentity = await dependencies.loadShopifyShopIdentityFn();

  for (const localPlatformEvent of localPlatformEvents) {
    const platformOrderId = localPlatformEvent.resourceId;

    if (!platformOrderId) {
      continue;
    }

    try {
      const orderSnapshotInput: SyncShopifyOrderSnapshotInput = {
        platformOrderId,
        platformAccountId: shopIdentity.id,
        shopDomain: shopIdentity.myshopifyDomain,
      };
      // Fetch latest order data from Shopify and upsert it into Postgres.
      const orderSnapshotResult =
        await dependencies.syncShopifyOrderSnapshotFn(orderSnapshotInput);
      const processedAt = dependencies.nowFn?.() ?? new Date();

      // Mark this webhook event as processed
      await dependencies.prisma.platformEvent.update({
        where: {
          id: localPlatformEvent.id,
        },
        data: {
          platformAccountId: orderSnapshotResult.localPlatformAccountId,
          processedAt,
        },
      });

      processedEvents.push({
        localPlatformEventId: localPlatformEvent.id,
        localOrderId: orderSnapshotResult.localOrderId,
        platformOrderId,
      });
    } catch (error) {
      failedEvents.push({
        localPlatformEventId: localPlatformEvent.id,
        message: errorMessage(error),
        platformOrderId,
      });
    }
  }

  return {
    candidateEventCount: localPlatformEvents.length,
    processedEvents,
    failedEvents,
  };
}
