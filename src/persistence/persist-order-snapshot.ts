import { Prisma } from "@prisma/client";
import type {
  Order,
  OrderLineItem,
  PlatformAccount,
  Refund,
  RefundLineItem,
  RefundTransaction,
} from "@prisma/client";
import { normalizeRequiredDate } from "./normalize-persistence-value.js";

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
  localPlatformAccountId: string;
  localOrderId: string;
  lineItemCount: number;
  refundCount: number;
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
  localOrderId: string;
  lineItem: OrderLineItemSnapshot;
}

interface BuildRefundWriteDataInput {
  platform: string;
  localOrderId: string;
  refund: RefundSnapshot;
}

interface BuildRefundTransactionWriteDataInput {
  platform: string;
  localRefundId: string;
  transaction: RefundTransactionSnapshot;
}

interface BuildRefundLineItemWriteDataInput {
  platform: string;
  localRefundId: string;
  localOrderLineItemId: string | null;
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

function buildOrderLineItemWriteData(
  input: BuildOrderLineItemWriteDataInput,
): Prisma.OrderLineItemUncheckedCreateInput {
  return {
    orderId: input.localOrderId,
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
    orderId: input.localOrderId,
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
    refundId: input.localRefundId,
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
    refundId: input.localRefundId,
    orderLineItemId: input.localOrderLineItemId,
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

    const localPlatformAccount = await transaction.platformAccount.upsert(
      platformAccountUpsertArgs,
    );

    const orderData: Prisma.OrderUncheckedCreateInput = {
      platformAccountId: localPlatformAccount.id,
      platform: input.platformAccount.platform,
      platformOrderId: input.order.platformOrderId,
      orderName: nullable(input.order.orderName),
      createdAtPlatform: normalizeRequiredDate(
        input.order.createdAtPlatform,
        "order.createdAtPlatform",
      ),
      financialStatus: input.order.financialStatus,
      fulfillmentStatus: nullable(input.order.fulfillmentStatus),
      totalAmount: nullable(input.order.totalAmount),
      currencyCode: nullable(input.order.currencyCode),
      rawPayload: nullableJson(input.order.rawPayload),
      syncedAt: normalizeRequiredDate(
        input.order.syncedAt ?? new Date(),
        "order.syncedAt",
      ),
    };
    const orderWhere: Prisma.OrderWhereUniqueInput = {
      platformAccountId_platformOrderId: {
        platformAccountId: localPlatformAccount.id,
        platformOrderId: input.order.platformOrderId,
      },
    };
    const orderUpsertArgs: Prisma.OrderUpsertArgs = {
      where: orderWhere,
      create: orderData,
      update: orderData,
    };
    const localOrder = await transaction.order.upsert(orderUpsertArgs);

    const localOrderLineItemIdsByPlatformLineItemId = new Map<string, string>();

    for (const lineItem of input.lineItems ?? []) {
      const lineItemWriteDataInput: BuildOrderLineItemWriteDataInput = {
        platform: input.platformAccount.platform,
        localOrderId: localOrder.id,
        lineItem,
      };
      const lineItemWriteData = buildOrderLineItemWriteData(
        lineItemWriteDataInput,
      );
      const lineItemWhere: Prisma.OrderLineItemWhereUniqueInput = {
        orderId_platformLineItemId: {
          orderId: localOrder.id,
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

      localOrderLineItemIdsByPlatformLineItemId.set(
        lineItem.platformLineItemId,
        localOrderLineItem.id,
      );
    }

    let refundCount = 0;

    for (const refund of input.refunds ?? []) {
      const refundWriteDataInput: BuildRefundWriteDataInput = {
        platform: input.platformAccount.platform,
        localOrderId: localOrder.id,
        refund,
      };
      const refundWriteData = buildRefundWriteData(refundWriteDataInput);
      const refundWhere: Prisma.RefundWhereUniqueInput = {
        orderId_platformRefundId: {
          orderId: localOrder.id,
          platformRefundId: refund.platformRefundId,
        },
      };
      const refundUpsertArgs: Prisma.RefundUpsertArgs = {
        where: refundWhere,
        create: refundWriteData,
        update: refundWriteData,
      };
      const localRefund = await transaction.refund.upsert(refundUpsertArgs);

      refundCount += 1;

      const refundLineItems = refund.lineItems ?? [];
      const shouldReplaceRefundLineItems =
        refundLineItems.length === 0 ||
        refundLineItems.some(
          (refundLineItem) => !refundLineItem.platformRefundLineItemId,
        );

      // Replace child rows when Shopify returns none or omits stable IDs.
      // Without stable IDs, existing rows cannot be matched safely for upsert.

      if (shouldReplaceRefundLineItems) {
        const replaceRefundLineItemsArgs: Prisma.RefundLineItemDeleteManyArgs =
          {
            where: {
              refundId: localRefund.id,
            },
          };

        await transaction.refundLineItem.deleteMany(replaceRefundLineItemsArgs);
      }

      const shouldUpsertRefundLineItems = !shouldReplaceRefundLineItems;

      for (const refundLineItem of refundLineItems) {
        const localOrderLineItemId =
          localOrderLineItemIdsByPlatformLineItemId.get(
            refundLineItem.platformLineItemId,
          ) ?? null;
        const refundLineItemWriteDataInput: BuildRefundLineItemWriteDataInput = {
          platform: input.platformAccount.platform,
          localRefundId: localRefund.id,
          localOrderLineItemId,
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
              refundId: localRefund.id,
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
            localRefundId: localRefund.id,
            transaction: refundTransaction,
          };
        const refundTransactionWriteData = buildRefundTransactionWriteData(
          refundTransactionWriteDataInput,
        );
        const refundTransactionWhere: Prisma.RefundTransactionWhereUniqueInput =
          {
            refundId_platformRefundTransactionId: {
              refundId: localRefund.id,
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
      localPlatformAccountId: localPlatformAccount.id,
      localOrderId: localOrder.id,
      lineItemCount: localOrderLineItemIdsByPlatformLineItemId.size,
      refundCount,
    };
  });
}
