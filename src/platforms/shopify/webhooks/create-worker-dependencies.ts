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

type SyncShopifyOrderSnapshotWithClient = (
  input: SyncShopifyOrderSnapshotInput,
  shopifyAdminClient: ShopifyAdminClient,
) => Promise<PersistOrderSnapshotResult>;

type SyncShopifyOrderSnapshotForAccount =
  ProcessPendingShopifyWebhookEventsDependencies["syncShopifyOrderSnapshotForAccountFn"];

export interface CreateShopifyWebhookWorkerDependenciesInput {
  prisma: ShopifyWebhookWorkerClient;
  credentialEncryptionKey: Buffer;
  appClientId?: string;
  appClientSecret?: string;
  apiVersion?: string;
  fetchImpl: typeof fetch;
  nowFn?: () => Date;
  syncShopifyOrderSnapshotWithClientFn: SyncShopifyOrderSnapshotWithClient;
}

export function createShopifyWebhookWorkerDependencies(
  input: CreateShopifyWebhookWorkerDependenciesInput,
): ProcessPendingShopifyWebhookEventsDependencies {
  const syncShopifyOrderSnapshotForAccount: SyncShopifyOrderSnapshotForAccount =
    async (orderSnapshotInput, localPlatformAccount) => {
      const shopifyAdminClient = await resolveShopifyAdminClient(
        localPlatformAccount,
        {
          prisma: input.prisma,
          credentialEncryptionKey: input.credentialEncryptionKey,
          appClientId: input.appClientId,
          appClientSecret: input.appClientSecret,
          apiVersion: input.apiVersion,
          fetchImpl: input.fetchImpl,
          nowFn: input.nowFn,
        },
      );

      return input.syncShopifyOrderSnapshotWithClientFn(
        orderSnapshotInput,
        shopifyAdminClient,
      );
    };

  return {
    prisma: input.prisma,
    nowFn: input.nowFn,
    syncShopifyOrderSnapshotForAccountFn: syncShopifyOrderSnapshotForAccount,
  };
}
