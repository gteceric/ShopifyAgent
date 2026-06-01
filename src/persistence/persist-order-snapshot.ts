import { Prisma } from "@prisma/client";
import type {
  Order,
  OrderLineItem,
  PlatformAccount,
  Refund,
  RefundLineItem,
  RefundTransaction,
} from "@prisma/client";

export type SnapshotJson = Prisma.InputJsonValue;
export type SnapshotMoneyAmount = string;

export interface PlatformAccountSnapshot {
  platform: string;
  platformAccountId: string;
  name?: string;
  shopDomain?: string;
  rawPayload?: SnapshotJson;
}

export interface OrderSnapshot {
  platformOrderId: string;
  orderName?: string;
  createdAtPlatform: Date | string;
  financialStatus: string;
  fulfillmentStatus?: string;
  totalAmount?: SnapshotMoneyAmount;
  currencyCode?: string;
  rawPayload?: SnapshotJson;
  syncedAt?: Date | string;
}

export interface OrderLineItemSnapshot {
  platformLineItemId: string;
  title?: string;
  sku?: string;
  variantTitle?: string;
  variantOptions?: SnapshotJson;
  imageUrl?: string;
  imageAltText?: string;
  category?: string;
  fulfillmentStatus?: string;
  hasReturnableFulfillment?: boolean;
  finalSale?: boolean;
  unitPrice?: SnapshotMoneyAmount;
  currencyCode?: string;
  currentQuantity?: number;
  returnableQuantity?: number;
  pendingRefundQuantity?: number;
  rawPayload?: SnapshotJson;
}

export interface RefundLineItemSnapshot {
  platformRefundLineItemId?: string;
  platformLineItemId: string;
  quantity: number;
  subtotalAmount?: SnapshotMoneyAmount;
  currencyCode?: string;
  rawPayload?: SnapshotJson;
}

export interface RefundTransactionSnapshot {
  platformRefundTransactionId: string;
  kind?: string;
  gateway?: string;
  status: string;
  amount?: SnapshotMoneyAmount;
  currencyCode?: string;
  rawPayload?: SnapshotJson;
}

export interface RefundSnapshot {
  platformRefundId: string;
  status: string;
  totalAmount?: SnapshotMoneyAmount;
  currencyCode?: string;
  rawPayload?: SnapshotJson;
  lineItems?: RefundLineItemSnapshot[];
  transactions?: RefundTransactionSnapshot[];
}

export interface PersistOrderSnapshotInput {
  platformAccount: PlatformAccountSnapshot;
  order: OrderSnapshot;
  lineItems?: OrderLineItemSnapshot[];
  refunds?: RefundSnapshot[];
}

export interface PersistOrderSnapshotResult {
  platformAccountId: string;
  localOrderId: string;
  lineItemIdsByPlatformLineItemId: Map<string, string>;
  refundIdsByPlatformRefundId: Map<string, string>;
}

export interface PersistOrderSnapshotTransaction {
  platformAccount: {
    upsert(args: Prisma.PlatformAccountUpsertArgs): Promise<PlatformAccount>;
  };
  order: {
    upsert(args: Prisma.OrderUpsertArgs): Promise<Order>;
  };
  orderLineItem: {
    upsert(args: Prisma.OrderLineItemUpsertArgs): Promise<OrderLineItem>;
  };
  refund: {
    upsert(args: Prisma.RefundUpsertArgs): Promise<Refund>;
  };
  refundLineItem: {
    deleteMany(
      args: Prisma.RefundLineItemDeleteManyArgs,
    ): Promise<Prisma.BatchPayload>;
    create(args: Prisma.RefundLineItemCreateArgs): Promise<unknown>;
    upsert(args: Prisma.RefundLineItemUpsertArgs): Promise<RefundLineItem>;
  };
  refundTransaction: {
    upsert(
      args: Prisma.RefundTransactionUpsertArgs,
    ): Promise<RefundTransaction>;
  };
}

export interface PersistOrderSnapshotClient {
  $transaction<T>(
    callback: (transaction: PersistOrderSnapshotTransaction) => Promise<T>,
  ): Promise<T>;
}

interface BuildOrderLineItemWriteDataInput {
  platform: string;
  orderId: string;
  lineItem: OrderLineItemSnapshot;
}

interface BuildRefundWriteDataInput {
  platform: string;
  orderId: string;
  refund: RefundSnapshot;
}

interface BuildRefundTransactionWriteDataInput {
  platform: string;
  refundId: string;
  transaction: RefundTransactionSnapshot;
}

interface BuildRefundLineItemWriteDataInput {
  platform: string;
  refundId: string;
  orderLineItemId: string | null;
  refundLineItem: RefundLineItemSnapshot;
}

function nullable<T>(value: T | undefined): T | null {
  return value ?? null;
}

function nullableJson(
  value: SnapshotJson | undefined,
): SnapshotJson | Prisma.NullTypes.JsonNull {
  return value ?? Prisma.JsonNull;
}

function normalizeDate(value: Date | string, fieldName: string): Date {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid date.`);
  }

  return date;
}

function buildOrderLineItemWriteData(
  input: BuildOrderLineItemWriteDataInput,
): Prisma.OrderLineItemUncheckedCreateInput {
  return {
    orderId: input.orderId,
    platform: input.platform,
    platformLineItemId: input.lineItem.platformLineItemId,
    title: nullable(input.lineItem.title),
    sku: nullable(input.lineItem.sku),
    variantTitle: nullable(input.lineItem.variantTitle),
    variantOptions: nullableJson(input.lineItem.variantOptions),
    imageUrl: nullable(input.lineItem.imageUrl),
    imageAltText: nullable(input.lineItem.imageAltText),
    category: nullable(input.lineItem.category),
    fulfillmentStatus: nullable(input.lineItem.fulfillmentStatus),
    hasReturnableFulfillment: input.lineItem.hasReturnableFulfillment ?? false,
    finalSale: input.lineItem.finalSale ?? false,
    unitPrice: nullable(input.lineItem.unitPrice),
    currencyCode: nullable(input.lineItem.currencyCode),
    currentQuantity: input.lineItem.currentQuantity ?? 0,
    returnableQuantity: input.lineItem.returnableQuantity ?? 0,
    pendingRefundQuantity: input.lineItem.pendingRefundQuantity ?? 0,
    rawPayload: nullableJson(input.lineItem.rawPayload),
  };
}

function buildRefundWriteData(
  input: BuildRefundWriteDataInput,
): Prisma.RefundUncheckedCreateInput {
  return {
    orderId: input.orderId,
    platform: input.platform,
    platformRefundId: input.refund.platformRefundId,
    status: input.refund.status,
    totalAmount: nullable(input.refund.totalAmount),
    currencyCode: nullable(input.refund.currencyCode),
    rawPayload: nullableJson(input.refund.rawPayload),
  };
}

function buildRefundTransactionWriteData(
  input: BuildRefundTransactionWriteDataInput,
): Prisma.RefundTransactionUncheckedCreateInput {
  return {
    refundId: input.refundId,
    platform: input.platform,
    platformRefundTransactionId: input.transaction.platformRefundTransactionId,
    kind: nullable(input.transaction.kind),
    gateway: nullable(input.transaction.gateway),
    status: input.transaction.status,
    amount: nullable(input.transaction.amount),
    currencyCode: nullable(input.transaction.currencyCode),
    rawPayload: nullableJson(input.transaction.rawPayload),
  };
}

function buildRefundLineItemWriteData(
  input: BuildRefundLineItemWriteDataInput,
): Prisma.RefundLineItemUncheckedCreateInput {
  return {
    refundId: input.refundId,
    orderLineItemId: input.orderLineItemId,
    platform: input.platform,
    platformRefundLineItemId: nullable(
      input.refundLineItem.platformRefundLineItemId,
    ),
    platformLineItemId: input.refundLineItem.platformLineItemId,
    quantity: input.refundLineItem.quantity,
    subtotalAmount: nullable(input.refundLineItem.subtotalAmount),
    currencyCode: nullable(input.refundLineItem.currencyCode),
    rawPayload: nullableJson(input.refundLineItem.rawPayload),
  };
}

export async function persistOrderSnapshot(
  input: PersistOrderSnapshotInput,
  client: PersistOrderSnapshotClient,
): Promise<PersistOrderSnapshotResult> {
  return client.$transaction(async (transaction) => {
    const platformAccountData: Prisma.PlatformAccountCreateInput = {
      platform: input.platformAccount.platform,
      platformAccountId: input.platformAccount.platformAccountId,
      name: nullable(input.platformAccount.name),
      shopDomain: nullable(input.platformAccount.shopDomain),
      rawPayload: nullableJson(input.platformAccount.rawPayload),
    };
    const platformAccountWhere: Prisma.PlatformAccountWhereUniqueInput = {
      platform_platformAccountId: {
        platform: input.platformAccount.platform,
        platformAccountId: input.platformAccount.platformAccountId,
      },
    };
    const platformAccountUpsertArgs: Prisma.PlatformAccountUpsertArgs = {
      where: platformAccountWhere,
      create: platformAccountData,
      update: platformAccountData,
    };

    const platformAccount = await transaction.platformAccount.upsert(
      platformAccountUpsertArgs,
    );

    const orderData: Prisma.OrderUncheckedCreateInput = {
      platformAccountId: platformAccount.id,
      platform: input.platformAccount.platform,
      platformOrderId: input.order.platformOrderId,
      orderName: nullable(input.order.orderName),
      createdAtPlatform: normalizeDate(
        input.order.createdAtPlatform,
        "order.createdAtPlatform",
      ),
      financialStatus: input.order.financialStatus,
      fulfillmentStatus: nullable(input.order.fulfillmentStatus),
      totalAmount: nullable(input.order.totalAmount),
      currencyCode: nullable(input.order.currencyCode),
      rawPayload: nullableJson(input.order.rawPayload),
      syncedAt: normalizeDate(
        input.order.syncedAt ?? new Date(),
        "order.syncedAt",
      ),
    };
    const orderWhere: Prisma.OrderWhereUniqueInput = {
      platformAccountId_platformOrderId: {
        platformAccountId: platformAccount.id,
        platformOrderId: input.order.platformOrderId,
      },
    };
    const orderUpsertArgs: Prisma.OrderUpsertArgs = {
      where: orderWhere,
      create: orderData,
      update: orderData,
    };
    const order = await transaction.order.upsert(orderUpsertArgs);

    const lineItemIdsByPlatformLineItemId = new Map<string, string>();

    for (const lineItem of input.lineItems ?? []) {
      const lineItemWriteDataInput: BuildOrderLineItemWriteDataInput = {
        platform: input.platformAccount.platform,
        orderId: order.id,
        lineItem,
      };
      const lineItemWriteData = buildOrderLineItemWriteData(
        lineItemWriteDataInput,
      );
      const lineItemWhere: Prisma.OrderLineItemWhereUniqueInput = {
        orderId_platformLineItemId: {
          orderId: order.id,
          platformLineItemId: lineItem.platformLineItemId,
        },
      };
      const lineItemUpsertArgs: Prisma.OrderLineItemUpsertArgs = {
        where: lineItemWhere,
        create: lineItemWriteData,
        update: lineItemWriteData,
      };
      const localOrderLineItem =
        await transaction.orderLineItem.upsert(lineItemUpsertArgs);

      lineItemIdsByPlatformLineItemId.set(
        lineItem.platformLineItemId,
        localOrderLineItem.id,
      );
    }

    const refundIdsByPlatformRefundId = new Map<string, string>();

    for (const refund of input.refunds ?? []) {
      const refundWriteDataInput: BuildRefundWriteDataInput = {
        platform: input.platformAccount.platform,
        orderId: order.id,
        refund,
      };
      const refundWriteData = buildRefundWriteData(refundWriteDataInput);
      const refundWhere: Prisma.RefundWhereUniqueInput = {
        orderId_platformRefundId: {
          orderId: order.id,
          platformRefundId: refund.platformRefundId,
        },
      };
      const refundUpsertArgs: Prisma.RefundUpsertArgs = {
        where: refundWhere,
        create: refundWriteData,
        update: refundWriteData,
      };
      const persistedRefund = await transaction.refund.upsert(refundUpsertArgs);

      refundIdsByPlatformRefundId.set(
        refund.platformRefundId,
        persistedRefund.id,
      );

      const refundLineItems = refund.lineItems ?? [];
      const shouldReplaceRefundLineItems =
        refundLineItems.length === 0 ||
        refundLineItems.some(
          (refundLineItem) => !refundLineItem.platformRefundLineItemId,
        );

      //         Shopify gives no refund line items now
      // Then we delete old children for this refund so stale rows don’t remain.

      // Some refund line item has no platformRefundLineItemId
      // Then we cannot uniquely match old row vs new row, so safest behavior is:
      // delete this refund’s child rows, then recreate from latest snapshot.

      if (shouldReplaceRefundLineItems) {
        const replaceRefundLineItemsArgs: Prisma.RefundLineItemDeleteManyArgs =
          {
            where: {
              refundId: persistedRefund.id,
            },
          };

        await transaction.refundLineItem.deleteMany(replaceRefundLineItemsArgs);
      }

      const shouldUpsertRefundLineItems = !shouldReplaceRefundLineItems;

      for (const refundLineItem of refundLineItems) {
        const localOrderLineItemId =
          lineItemIdsByPlatformLineItemId.get(
            refundLineItem.platformLineItemId,
          ) ?? null;
        const refundLineItemWriteDataInput: BuildRefundLineItemWriteDataInput = {
          platform: input.platformAccount.platform,
          refundId: persistedRefund.id,
          orderLineItemId: localOrderLineItemId,
          refundLineItem,
        };
        const refundLineItemWriteData = buildRefundLineItemWriteData(
          refundLineItemWriteDataInput,
        );

        if (
          shouldUpsertRefundLineItems &&
          refundLineItem.platformRefundLineItemId
        ) {
          const refundLineItemWhere: Prisma.RefundLineItemWhereUniqueInput = {
            refundId_platformRefundLineItemId: {
              refundId: persistedRefund.id,
              platformRefundLineItemId: refundLineItem.platformRefundLineItemId,
            },
          };
          const refundLineItemUpsertArgs: Prisma.RefundLineItemUpsertArgs = {
            where: refundLineItemWhere,
            create: refundLineItemWriteData,
            update: refundLineItemWriteData,
          };

          await transaction.refundLineItem.upsert(refundLineItemUpsertArgs);
        } else {
          const refundLineItemCreateArgs: Prisma.RefundLineItemCreateArgs = {
            data: refundLineItemWriteData,
          };

          await transaction.refundLineItem.create(refundLineItemCreateArgs);
        }
      }

      for (const refundTransaction of refund.transactions ?? []) {
        const refundTransactionWriteDataInput: BuildRefundTransactionWriteDataInput =
          {
            platform: input.platformAccount.platform,
            refundId: persistedRefund.id,
            transaction: refundTransaction,
          };
        const refundTransactionWriteData = buildRefundTransactionWriteData(
          refundTransactionWriteDataInput,
        );
        const refundTransactionWhere: Prisma.RefundTransactionWhereUniqueInput =
          {
            refundId_platformRefundTransactionId: {
              refundId: persistedRefund.id,
              platformRefundTransactionId:
                refundTransaction.platformRefundTransactionId,
            },
          };
        const refundTransactionUpsertArgs: Prisma.RefundTransactionUpsertArgs =
          {
            where: refundTransactionWhere,
            create: refundTransactionWriteData,
            update: refundTransactionWriteData,
          };

        await transaction.refundTransaction.upsert(refundTransactionUpsertArgs);
      }
    }

    return {
      platformAccountId: platformAccount.id,
      localOrderId: order.id,
      lineItemIdsByPlatformLineItemId,
      refundIdsByPlatformRefundId,
    };
  });
}
