import {
  loadShopifyOrderRefundSyncData,
  type RefundContext,
  type RefundContextInput,
  type RefundContextLineItem,
  type ShopifyRefundSyncLineItem,
  type ShopifyRefundSyncRecord,
  type ShopifyRefundSyncTransaction,
} from "@shopify-agent/core";
import type { PrismaClient } from "@prisma/client";
import type {
  OrderLineItemSnapshot,
  PersistOrderSnapshotInput,
  PersistOrderSnapshotResult,
  PlatformAccountSnapshot,
  RefundLineItemSnapshot,
  RefundSnapshot,
  RefundTransactionSnapshot,
  OrderSnapshot,
  SnapshotJson,
} from "../persistence/persist-order-snapshot.js";
import { persistOrderSnapshot } from "../persistence/persist-order-snapshot.js";

export interface BuildShopifyOrderSnapshotInput {
  context: RefundContext;
  refunds?: ShopifyRefundSyncRecord[];
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

function mapRefundLineItemToSnapshot(
  lineItem: ShopifyRefundSyncLineItem,
): RefundLineItemSnapshot {
  return {
    platformRefundLineItemId: lineItem.platformRefundLineItemId,
    platformLineItemId: lineItem.lineItemId,
    quantity: lineItem.quantity,
    subtotalAmount: lineItem.subtotal?.amount,
    currencyCode: lineItem.subtotal?.currencyCode,
  };
}

function mapRefundTransactionToSnapshot(
  transaction: ShopifyRefundSyncTransaction,
): RefundTransactionSnapshot {
  return {
    platformRefundTransactionId: transaction.transactionId,
    kind: normalizeOptionalString(transaction.kind),
    gateway: normalizeOptionalString(transaction.gateway),
    status: transaction.status,
    amount: transaction.amount?.amount,
    currencyCode: transaction.amount?.currencyCode,
  };
}

function mapRefundToSnapshot(
  refund: ShopifyRefundSyncRecord,
): RefundSnapshot {
  const lineItemSnapshots: RefundLineItemSnapshot[] = refund.lineItems.map(
    mapRefundLineItemToSnapshot,
  );
  const transactionSnapshots: RefundTransactionSnapshot[] =
    refund.transactions.map(mapRefundTransactionToSnapshot);

  return {
    platformRefundId: refund.refundId,
    status: refund.status,
    totalAmount: refund.totalRefunded?.amount,
    currencyCode: refund.totalRefunded?.currencyCode,
    lineItems: lineItemSnapshots,
    transactions: transactionSnapshots,
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
  const refundSnapshots: RefundSnapshot[] = (input.refunds ?? []).map(
    mapRefundToSnapshot,
  );

  return {
    platformAccount: platformAccountSnapshot,
    order: orderSnapshot,
    lineItems: lineItemSnapshots,
    refunds: refundSnapshots,
  };
}

export async function syncShopifyOrderSnapshot(
  input: SyncShopifyOrderSnapshotInput,
  dependencies: SyncShopifyOrderSnapshotDependencies,
): Promise<PersistOrderSnapshotResult> {
  const loadSnapshotInput: RefundContextInput = {
    orderId: input.orderId,
  };
  const shopifyOrderRefundSyncData =
    await loadShopifyOrderRefundSyncData(loadSnapshotInput);
  const buildSnapshotInput: BuildShopifyOrderSnapshotInput = {
    context: shopifyOrderRefundSyncData.context,
    refunds: shopifyOrderRefundSyncData.refunds,
    shopDomain: input.shopDomain,
    syncedAt: input.syncedAt,
  };
  const snapshotInput = buildShopifyOrderSnapshotInput(buildSnapshotInput);

  return persistOrderSnapshot(snapshotInput, dependencies.prisma);
}
