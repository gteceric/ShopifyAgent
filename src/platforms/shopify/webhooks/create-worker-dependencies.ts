import type { ShopifyAdminClient } from "@shopify-agent/core";
import type { PersistOrderSnapshotResult } from "../../../persistence/persist-order-snapshot.js";
import { resolveShopifyAdminClient } from "../admin-client/resolve-admin-client.js";
import type { ShopifyInstallationClient } from "../persistence/installation.js";
import type { SyncShopifyOrderSnapshotInput } from "../sync/order-snapshot.js";
import type {
  ProcessPendingShopifyWebhookEventsDependencies,
  ProcessShopifyWebhookEventsClient,
} from "./process-webhook-events.js";

export interface ShopifyWebhookWorkerClient
  extends ProcessShopifyWebhookEventsClient,
    ShopifyInstallationClient {}

export interface CreateShopifyWebhookWorkerDependenciesInput {
  prisma: ShopifyWebhookWorkerClient;
  credentialEncryptionKey: Buffer;
  apiVersion?: string;
  fetchImpl?: typeof fetch;
  nowFn?: () => Date;
  syncShopifyOrderSnapshotFn: (
    input: SyncShopifyOrderSnapshotInput,
    shopifyAdminClient: ShopifyAdminClient,
  ) => Promise<PersistOrderSnapshotResult>;
}

export function createShopifyWebhookWorkerDependencies(
  input: CreateShopifyWebhookWorkerDependenciesInput,
): ProcessPendingShopifyWebhookEventsDependencies {
  return {
    prisma: input.prisma,
    nowFn: input.nowFn,
    syncShopifyOrderSnapshotFn: async (
      orderSnapshotInput,
      localPlatformAccount,
    ) => {
      const shopifyAdminClient = await resolveShopifyAdminClient(
        localPlatformAccount,
        {
          prisma: input.prisma,
          credentialEncryptionKey: input.credentialEncryptionKey,
          apiVersion: input.apiVersion,
          fetchImpl: input.fetchImpl,
          nowFn: input.nowFn,
        },
      );

      return input.syncShopifyOrderSnapshotFn(
        orderSnapshotInput,
        shopifyAdminClient,
      );
    },
  };
}
