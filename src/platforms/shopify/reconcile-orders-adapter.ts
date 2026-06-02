import { loadOrders, loadShopifyShopIdentity } from "@shopify-agent/core";
import type { PrismaClient } from "@prisma/client";
import type {
  PlatformReconciliationInput,
  ReconcileOrderSnapshotInput,
  ReconcileOrdersDependencies,
} from "../../sync/reconcile-orders.js";
import {
  syncShopifyOrderSnapshot,
  type SyncShopifyOrderSnapshotDependencies,
  type SyncShopifyOrderSnapshotInput,
} from "./sync-order-snapshot.js";

export async function loadShopifyReconciliationInput(): Promise<PlatformReconciliationInput> {
  if (process.env.USE_REAL_SHOPIFY !== "true") {
    throw new Error(
      "Shopify order reconciliation requires USE_REAL_SHOPIFY=true.",
    );
  }

  const shopIdentity = await loadShopifyShopIdentity();

  return {
    platformAccountId: shopIdentity.id,
    platformAccountData: {
      name: shopIdentity.name,
      shopDomain: shopIdentity.myshopifyDomain,
    },
    platformContext: {
      shopDomain: shopIdentity.myshopifyDomain,
    },
  };
}

function readShopDomainFromSnapshotInput(
  input: ReconcileOrderSnapshotInput,
): string {
  const shopDomain = input.platformContext?.shopDomain;

  if (typeof shopDomain !== "string" || shopDomain.trim() === "") {
    throw new Error("shopDomain is required to reconcile Shopify orders.");
  }

  return shopDomain;
}

export function createShopifyReconcileOrdersDependencies(
  prisma: PrismaClient,
): ReconcileOrdersDependencies {
  return {
    prisma,
    loadOrderCandidatesFn: async (loadInput) => {
      const shopifyOrders = await loadOrders(loadInput);

      return shopifyOrders.map((order) => ({
        platformOrderId: order.id,
      }));
    },
    syncOrderSnapshotFn: async (orderSnapshotInput) => {
      const shopDomain = readShopDomainFromSnapshotInput(
        orderSnapshotInput,
      );
      const shopifyOrderSnapshotInput: SyncShopifyOrderSnapshotInput = {
        platformOrderId: orderSnapshotInput.platformOrderId,
        platformAccountId: orderSnapshotInput.platformAccountId,
        shopDomain,
        syncedAt: orderSnapshotInput.syncedAt,
      };
      const shopifyOrderSnapshotDependencies:
        SyncShopifyOrderSnapshotDependencies = {
          prisma,
        };

      return syncShopifyOrderSnapshot(
        shopifyOrderSnapshotInput,
        shopifyOrderSnapshotDependencies,
      );
    },
  };
}
