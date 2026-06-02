import assert from "node:assert/strict";
import { loadShopifyOrderRefundSyncData } from "@shopify-agent/core";
import type {
  RefundContextLineItem,
  ShopifyOrderRefundSyncData,
  ShopifyRefundSyncLineItem,
  ShopifyRefundSyncRecord,
  ShopifyRefundSyncTransaction,
} from "@shopify-agent/core";
import type { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "../../persistence/prisma-client.js";
import {
  createShopifyReconcileOrdersDependencies,
  loadShopifyReconciliationInput,
} from "../../platforms/shopify/reconcile-orders-adapter.js";
import {
  ORDER_RECONCILIATION_SYNC_TYPE,
  reconcileOrders,
  type ReconcileOrdersInput,
} from "../../sync/reconcile-orders.js";

interface ReconciliationSmokeDatabaseCounts {
  platformAccounts: number;
  orders: number;
  orderLineItems: number;
  refunds: number;
  refundLineItems: number;
  refundTransactions: number;
  syncRuns: number;
}

const EMPTY_RECONCILIATION_DATABASE_COUNTS: ReconciliationSmokeDatabaseCounts =
  {
    platformAccounts: 0,
    orders: 0,
    orderLineItems: 0,
    refunds: 0,
    refundLineItems: 0,
    refundTransactions: 0,
    syncRuns: 0,
  };

function readSmokeDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL_SMOKE?.trim();

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL_SMOKE is required for the reconciliation smoke test.",
    );
  }

  return databaseUrl;
}

function readShopDomain(
  platformContext: Record<string, unknown> | undefined,
): string {
  const shopDomain = platformContext?.shopDomain;

  if (typeof shopDomain !== "string" || shopDomain.trim() === "") {
    throw new Error(
      "shopDomain is required for the reconciliation smoke test.",
    );
  }

  return shopDomain;
}

function nullableNormalizedString(value: string | undefined): string | null {
  return value?.trim() || null;
}

function nullableMoneyAmount(
  money: { amount: string } | undefined,
): string | null {
  return money?.amount ?? null;
}

function nullableDecimalString(
  decimal: { toString(): string } | null,
): string | null {
  return decimal?.toString() ?? null;
}

function sortedBy<T>(values: T[], keyFn: (value: T) => string): T[] {
  return [...values].sort((left, right) =>
    keyFn(left).localeCompare(keyFn(right)),
  );
}

async function countReconciliationSmokeDatabaseRows(
  prisma: PrismaClient,
): Promise<ReconciliationSmokeDatabaseCounts> {
  const [
    platformAccounts,
    orders,
    orderLineItems,
    refunds,
    refundLineItems,
    refundTransactions,
    syncRuns,
  ] = await Promise.all([
    prisma.platformAccount.count(),
    prisma.order.count(),
    prisma.orderLineItem.count(),
    prisma.refund.count(),
    prisma.refundLineItem.count(),
    prisma.refundTransaction.count(),
    prisma.syncRun.count(),
  ]);

  return {
    platformAccounts,
    orders,
    orderLineItems,
    refunds,
    refundLineItems,
    refundTransactions,
    syncRuns,
  };
}

function assertSmokeDatabaseIsEmpty(
  counts: ReconciliationSmokeDatabaseCounts,
): void {
  assert.deepEqual(
    counts,
    EMPTY_RECONCILIATION_DATABASE_COUNTS,
    "Reconciliation smoke test requires an empty dedicated database because cleanup deletes the inserted platform account and its snapshot rows.",
  );
}

function formatExpectedLineItems(lineItems: RefundContextLineItem[]) {
  return sortedBy(lineItems, (lineItem) => lineItem.lineItemId).map(
    (lineItem) => ({
      platformLineItemId: lineItem.lineItemId,
      title: nullableNormalizedString(lineItem.title),
      sku: nullableNormalizedString(lineItem.sku),
      returnableQuantity: lineItem.returnableQuantity ?? 0,
      pendingRefundQuantity: lineItem.pendingRefundQuantity ?? 0,
      unitPrice: nullableMoneyAmount(lineItem.unitPrice),
      currencyCode: lineItem.unitPrice?.currencyCode ?? null,
    }),
  );
}

function formatPersistedLineItems(
  lineItems: Array<{
    platformLineItemId: string;
    title: string | null;
    sku: string | null;
    returnableQuantity: number;
    pendingRefundQuantity: number;
    unitPrice: { toString(): string } | null;
    currencyCode: string | null;
  }>,
) {
  return sortedBy(lineItems, (lineItem) => lineItem.platformLineItemId).map(
    (lineItem) => ({
      platformLineItemId: lineItem.platformLineItemId,
      title: lineItem.title,
      sku: lineItem.sku,
      returnableQuantity: lineItem.returnableQuantity,
      pendingRefundQuantity: lineItem.pendingRefundQuantity,
      unitPrice: nullableDecimalString(lineItem.unitPrice),
      currencyCode: lineItem.currencyCode,
    }),
  );
}

function refundLineItemSortKey(lineItem: ShopifyRefundSyncLineItem): string {
  return [
    lineItem.platformRefundLineItemId ?? "",
    lineItem.lineItemId,
    lineItem.quantity,
  ].join(":");
}

function persistedRefundLineItemSortKey(lineItem: {
  platformRefundLineItemId: string | null;
  platformLineItemId: string;
  quantity: number;
}): string {
  return [
    lineItem.platformRefundLineItemId ?? "",
    lineItem.platformLineItemId,
    lineItem.quantity,
  ].join(":");
}

function formatExpectedRefundLineItems(
  lineItems: ShopifyRefundSyncLineItem[],
  localOrderLineItemIdsByPlatformLineItemId: Map<string, string>,
) {
  return sortedBy(lineItems, refundLineItemSortKey).map((lineItem) => ({
    platformRefundLineItemId: lineItem.platformRefundLineItemId ?? null,
    platformLineItemId: lineItem.lineItemId,
    localOrderLineItemId:
      localOrderLineItemIdsByPlatformLineItemId.get(lineItem.lineItemId) ??
      null,
    quantity: lineItem.quantity,
    subtotalAmount: nullableMoneyAmount(lineItem.subtotal),
    currencyCode: lineItem.subtotal?.currencyCode ?? null,
  }));
}

function formatPersistedRefundLineItems(
  lineItems: Array<{
    platformRefundLineItemId: string | null;
    platformLineItemId: string;
    orderLineItemId: string | null;
    quantity: number;
    subtotalAmount: { toString(): string } | null;
    currencyCode: string | null;
  }>,
) {
  return sortedBy(lineItems, persistedRefundLineItemSortKey).map(
    (lineItem) => ({
      platformRefundLineItemId: lineItem.platformRefundLineItemId,
      platformLineItemId: lineItem.platformLineItemId,
      localOrderLineItemId: lineItem.orderLineItemId,
      quantity: lineItem.quantity,
      subtotalAmount: nullableDecimalString(lineItem.subtotalAmount),
      currencyCode: lineItem.currencyCode,
    }),
  );
}

function formatExpectedRefundTransactions(
  transactions: ShopifyRefundSyncTransaction[],
) {
  return sortedBy(transactions, (transaction) => transaction.transactionId).map(
    (transaction) => ({
      platformRefundTransactionId: transaction.transactionId,
      kind: nullableNormalizedString(transaction.kind),
      gateway: nullableNormalizedString(transaction.gateway),
      status: transaction.status,
      amount: nullableMoneyAmount(transaction.amount),
      currencyCode: transaction.amount?.currencyCode ?? null,
    }),
  );
}

function formatPersistedRefundTransactions(
  transactions: Array<{
    platformRefundTransactionId: string;
    kind: string | null;
    gateway: string | null;
    status: string;
    amount: { toString(): string } | null;
    currencyCode: string | null;
  }>,
) {
  return sortedBy(
    transactions,
    (transaction) => transaction.platformRefundTransactionId,
  ).map((transaction) => ({
    platformRefundTransactionId: transaction.platformRefundTransactionId,
    kind: transaction.kind,
    gateway: transaction.gateway,
    status: transaction.status,
    amount: nullableDecimalString(transaction.amount),
    currencyCode: transaction.currencyCode,
  }));
}

function formatExpectedRefunds(
  refunds: ShopifyRefundSyncRecord[],
  localOrderLineItemIdsByPlatformLineItemId: Map<string, string>,
) {
  return sortedBy(refunds, (refund) => refund.refundId).map((refund) => ({
    platformRefundId: refund.refundId,
    status: refund.status,
    totalAmount: nullableMoneyAmount(refund.totalRefunded),
    currencyCode: refund.totalRefunded?.currencyCode ?? null,
    lineItems: formatExpectedRefundLineItems(
      refund.lineItems,
      localOrderLineItemIdsByPlatformLineItemId,
    ),
    transactions: formatExpectedRefundTransactions(refund.transactions),
  }));
}

function formatPersistedRefunds(
  refunds: Array<{
    platformRefundId: string;
    status: string;
    totalAmount: { toString(): string } | null;
    currencyCode: string | null;
    lineItems: Array<{
      platformRefundLineItemId: string | null;
      platformLineItemId: string;
      orderLineItemId: string | null;
      quantity: number;
      subtotalAmount: { toString(): string } | null;
      currencyCode: string | null;
    }>;
    transactions: Array<{
      platformRefundTransactionId: string;
      kind: string | null;
      gateway: string | null;
      status: string;
      amount: { toString(): string } | null;
      currencyCode: string | null;
    }>;
  }>,
) {
  return sortedBy(refunds, (refund) => refund.platformRefundId).map(
    (refund) => ({
      platformRefundId: refund.platformRefundId,
      status: refund.status,
      totalAmount: nullableDecimalString(refund.totalAmount),
      currencyCode: refund.currencyCode,
      lineItems: formatPersistedRefundLineItems(refund.lineItems),
      transactions: formatPersistedRefundTransactions(refund.transactions),
    }),
  );
}

async function verifyPersistedSnapshot(
  prisma: PrismaClient,
  input: {
    localOrderId: string;
    localPlatformAccountId: string;
    platformAccountId: string;
    shopDomain: string;
    shopifyOrderRefundSyncData: ShopifyOrderRefundSyncData;
  },
): Promise<void> {
  const localPlatformAccount = await prisma.platformAccount.findUnique({
    where: {
      id: input.localPlatformAccountId,
    },
  });
  const localOrder = await prisma.order.findUnique({
    where: {
      id: input.localOrderId,
    },
    include: {
      lineItems: true,
      refunds: {
        include: {
          lineItems: true,
          transactions: true,
        },
      },
    },
  });

  assert.ok(localPlatformAccount, "Persisted platform account was not found.");
  assert.ok(localOrder, "Persisted order was not found.");

  assert.equal(localPlatformAccount.platform, "shopify");
  assert.equal(localPlatformAccount.platformAccountId, input.platformAccountId);
  assert.equal(localPlatformAccount.shopDomain, input.shopDomain);

  const expectedOrder = input.shopifyOrderRefundSyncData.context.order;

  assert.equal(localOrder.platformAccountId, localPlatformAccount.id);
  assert.equal(localOrder.platformOrderId, expectedOrder.id);
  assert.equal(localOrder.orderName, expectedOrder.name);
  assert.equal(
    localOrder.createdAtPlatform.toISOString(),
    new Date(expectedOrder.createdAt).toISOString(),
  );
  assert.equal(localOrder.financialStatus, expectedOrder.financialStatus);
  assert.equal(
    localOrder.totalAmount?.toString() ?? null,
    expectedOrder.totalAmount.toString(),
  );

  assert.deepEqual(
    formatPersistedLineItems(localOrder.lineItems),
    formatExpectedLineItems(input.shopifyOrderRefundSyncData.context.lineItems),
  );

  const localOrderLineItemIdsByPlatformLineItemId = new Map(
    localOrder.lineItems.map((lineItem) => [
      lineItem.platformLineItemId,
      lineItem.id,
    ]),
  );

  assert.deepEqual(
    formatPersistedRefunds(localOrder.refunds),
    formatExpectedRefunds(
      input.shopifyOrderRefundSyncData.refunds,
      localOrderLineItemIdsByPlatformLineItemId,
    ),
  );
}

async function cleanupSmokeRows(
  prisma: PrismaClient,
  input: {
    localPlatformAccountId?: string;
    platformAccountId?: string;
  },
): Promise<void> {
  const localPlatformAccount =
    input.localPlatformAccountId === undefined &&
    input.platformAccountId !== undefined
      ? await prisma.platformAccount.findUnique({
          where: {
            platform_platformAccountId: {
              platform: "shopify",
              platformAccountId: input.platformAccountId,
            },
          },
        })
      : undefined;
  const localPlatformAccountId =
    input.localPlatformAccountId ?? localPlatformAccount?.id;

  if (!localPlatformAccountId) {
    return;
  }

  await prisma.syncRun.deleteMany({
    where: {
      platformAccountId: localPlatformAccountId,
    },
  });
  await prisma.platformAccount.deleteMany({
    where: {
      id: localPlatformAccountId,
    },
  });
}

async function main(): Promise<void> {
  const prisma = createPrismaClient({
    databaseUrl: readSmokeDatabaseUrl(),
  });
  let localPlatformAccountId: string | undefined;
  let platformAccountId: string | undefined;
  let smokeDatabaseWasEmpty = false;

  try {
    const baselineCounts = await countReconciliationSmokeDatabaseRows(prisma);

    assertSmokeDatabaseIsEmpty(baselineCounts);
    smokeDatabaseWasEmpty = true;

    const platformInput = await loadShopifyReconciliationInput();
    const shopDomain = readShopDomain(platformInput.platformContext);

    platformAccountId = platformInput.platformAccountId;

    const reconcileInput: ReconcileOrdersInput = {
      platform: "shopify",
      platformAccountId: platformInput.platformAccountId,
      platformAccountData: platformInput.platformAccountData,
      platformContext: platformInput.platformContext,
      limit: 1,
    };
    const reconcileResult = await reconcileOrders(
      reconcileInput,
      createShopifyReconcileOrdersDependencies(prisma),
    );

    localPlatformAccountId = reconcileResult.localPlatformAccountId;

    assert.equal(
      reconcileResult.status,
      "succeeded",
      `Expected reconciliation to succeed: ${JSON.stringify(reconcileResult.failedOrders)}`,
    );
    assert.equal(reconcileResult.candidateOrderCount, 1);
    assert.equal(reconcileResult.syncedOrders.length, 1);
    assert.equal(reconcileResult.failedOrders.length, 0);

    const syncedOrder = reconcileResult.syncedOrders[0]!;
    const shopifyOrderRefundSyncData = await loadShopifyOrderRefundSyncData({
      orderId: syncedOrder.platformOrderId,
    });

    await verifyPersistedSnapshot(prisma, {
      localOrderId: syncedOrder.localOrderId,
      localPlatformAccountId: reconcileResult.localPlatformAccountId,
      platformAccountId: platformInput.platformAccountId,
      shopDomain,
      shopifyOrderRefundSyncData,
    });

    const localSyncRun = await prisma.syncRun.findUnique({
      where: {
        id: reconcileResult.localSyncRunId,
      },
    });

    assert.ok(localSyncRun, "Persisted SyncRun was not found.");
    assert.equal(localSyncRun.status, "succeeded");

    console.log("Shopify reconciliation smoke test passed");
    console.log(
      JSON.stringify(
        {
          localSyncRunId: reconcileResult.localSyncRunId,
          localPlatformAccountId: reconcileResult.localPlatformAccountId,
          localOrderId: syncedOrder.localOrderId,
          platformOrderId: syncedOrder.platformOrderId,
          lineItemCount: syncedOrder.lineItemCount,
          refundCount: syncedOrder.refundCount,
        },
        null,
        2,
      ),
    );
  } finally {
    try {
      if (smokeDatabaseWasEmpty) {
        await cleanupSmokeRows(prisma, {
          localPlatformAccountId,
          platformAccountId,
        });

        const remainingCounts =
          await countReconciliationSmokeDatabaseRows(prisma);

        assertSmokeDatabaseIsEmpty(remainingCounts);
      }
    } finally {
      await prisma.$disconnect();
    }
  }
}

main().catch((error: unknown) => {
  console.error("Failed to run Shopify reconciliation smoke test.");
  console.error(error);
  process.exitCode = 1;
});
