import {
  createShopifyAdminRefundContextAdapter,
  type RefundContext,
  type RefundContextLineItem,
} from "@shopify-agent/core";
import type { PrismaClient } from "@prisma/client";
import type {
  OrderLineItemSnapshot,
  PersistOrderSnapshotInput,
  PersistOrderSnapshotResult,
  PlatformAccountSnapshot,
  OrderSnapshot,
  SnapshotJson,
} from "../persistence/persist-order-snapshot.js";
import { persistOrderSnapshot } from "../persistence/persist-order-snapshot.js";

export interface BuildShopifyOrderSnapshotInput {
  context: RefundContext;
  shopDomain: string;
  syncedAt?: Date;
}

export interface SyncShopifyOrderSnapshotInput {
  orderId: string;
  shopDomain: string;
  syncedAt?: Date;
}

export interface SyncShopifyOrderSnapshotDependencies {
  prisma: PrismaClient;
}

function normalizeOptionalString(
  value: string | undefined,
): string | undefined {
  const normalizedValue = value?.trim();

  return normalizedValue ? normalizedValue : undefined;
}

function mapVariantOptionsToJson(
  lineItem: RefundContextLineItem,
): SnapshotJson | undefined {
  if (!lineItem.variantOptions || lineItem.variantOptions.length === 0) {
    return undefined;
  }

  return lineItem.variantOptions.map((option) => ({
    name: option.name,
    value: option.value,
  }));
}

function mapLineItemToSnapshot(
  lineItem: RefundContextLineItem,
): OrderLineItemSnapshot {
  return {
    platformLineItemId: lineItem.lineItemId,
    title: normalizeOptionalString(lineItem.title),
    sku: normalizeOptionalString(lineItem.sku),
    variantTitle: normalizeOptionalString(lineItem.variantTitle),
    variantOptions: mapVariantOptionsToJson(lineItem),
    imageUrl: normalizeOptionalString(lineItem.imageUrl),
    imageAltText: normalizeOptionalString(lineItem.imageAltText),
    fulfillmentLineItemId: normalizeOptionalString(
      lineItem.fulfillmentLineItemId,
    ),
    category: normalizeOptionalString(lineItem.category),
    fulfillmentStatus: lineItem.fulfillmentStatus,
    hasReturnableFulfillment: lineItem.hasReturnableFulfillment,
    finalSale: lineItem.finalSale,
    unitPrice: lineItem.unitPrice?.amount,
    currencyCode: lineItem.unitPrice?.currencyCode,
    returnableQuantity: lineItem.returnableQuantity,
    pendingRefundQuantity: lineItem.pendingRefundQuantity ?? 0,
  };
}

export function buildShopifyOrderSnapshotInput(
  input: BuildShopifyOrderSnapshotInput,
): PersistOrderSnapshotInput {
  const platformAccountSnapshot: PlatformAccountSnapshot = {
    platform: "shopify",
    platformAccountId: input.shopDomain,
    shopDomain: input.shopDomain,
  };
  const orderSnapshot: OrderSnapshot = {
    platformOrderId: input.context.order.id,
    orderName: input.context.order.name,
    createdAtPlatform: input.context.order.createdAt,
    financialStatus: input.context.order.financialStatus,
    totalAmount: input.context.order.totalAmount.toString(),
    syncedAt: input.syncedAt,
  };
  const lineItemSnapshots: OrderLineItemSnapshot[] =
    input.context.lineItems.map(mapLineItemToSnapshot);

  return {
    platformAccount: platformAccountSnapshot,
    order: orderSnapshot,
    lineItems: lineItemSnapshots,
  };
}

export async function syncShopifyOrderSnapshot(
  input: SyncShopifyOrderSnapshotInput,
  dependencies: SyncShopifyOrderSnapshotDependencies,
): Promise<PersistOrderSnapshotResult> {
  const adapter = createShopifyAdminRefundContextAdapter();
  const context = await adapter.loadRefundContext({ orderId: input.orderId });
  const buildSnapshotInput: BuildShopifyOrderSnapshotInput = {
    context,
    shopDomain: input.shopDomain,
    syncedAt: input.syncedAt,
  };
  const snapshotInput = buildShopifyOrderSnapshotInput(buildSnapshotInput);

  return persistOrderSnapshot(snapshotInput, dependencies.prisma);
}
