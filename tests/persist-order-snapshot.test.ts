import assert from "node:assert/strict";
import test from "node:test";
import type {
  Order,
  OrderLineItem,
  PlatformAccount,
  Prisma,
  Refund,
  RefundLineItem,
  RefundTransaction,
} from "@prisma/client";
import {
  persistOrderSnapshot,
  type PersistOrderSnapshotClient,
  type PersistOrderSnapshotTransaction,
} from "../src/persistence/persist-order-snapshot.js";

interface RecordedCall {
  operation: string;
  args: unknown;
}

class FakePersistOrderSnapshotClient implements PersistOrderSnapshotClient {
  readonly calls: RecordedCall[] = [];

  readonly transaction: PersistOrderSnapshotTransaction = {
    platformAccount: {
      upsert: async (args) => {
        this.calls.push({ operation: "platformAccount.upsert", args });

        return {
          id: "platform-account-1",
          ...args.create,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        } as PlatformAccount;
      },
    },
    order: {
      upsert: async (args) => {
        this.calls.push({ operation: "order.upsert", args });

        return {
          id: "order-1",
          ...args.create,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        } as Order;
      },
    },
    orderLineItem: {
      upsert: async (args) => {
        this.calls.push({ operation: "orderLineItem.upsert", args });
        const platformLineItemId = args.create.platformLineItemId;

        return {
          id: `line-item:${platformLineItemId}`,
          ...args.create,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        } as OrderLineItem;
      },
    },
    refund: {
      upsert: async (args) => {
        this.calls.push({ operation: "refund.upsert", args });
        const platformRefundId = args.create.platformRefundId;

        return {
          id: `refund:${platformRefundId}`,
          ...args.create,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        } as Refund;
      },
    },
    refundLineItem: {
      deleteMany: async (args) => {
        this.calls.push({ operation: "refundLineItem.deleteMany", args });

        return { count: 1 };
      },
      create: async (args) => {
        this.calls.push({ operation: "refundLineItem.create", args });

        return {};
      },
      upsert: async (args) => {
        this.calls.push({ operation: "refundLineItem.upsert", args });
        const platformRefundLineItemId = args.create.platformRefundLineItemId;

        return {
          id: `refund-line-item:${platformRefundLineItemId}`,
          ...args.create,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        } as RefundLineItem;
      },
    },
    refundTransaction: {
      upsert: async (args) => {
        this.calls.push({ operation: "refundTransaction.upsert", args });
        const platformRefundTransactionId =
          args.create.platformRefundTransactionId;

        return {
          id: `transaction:${platformRefundTransactionId}`,
          ...args.create,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        } as RefundTransaction;
      },
    },
  };

  async $transaction<T>(
    callback: (transaction: PersistOrderSnapshotTransaction) => Promise<T>,
  ): Promise<T> {
    return callback(this.transaction);
  }
}

function findCall<TArgs>(calls: RecordedCall[], operation: string): TArgs {
  const call = calls.find((recordedCall) => recordedCall.operation === operation);

  assert.ok(call, `${operation} was not called.`);

  return call.args as TArgs;
}

test("persists an order snapshot using platform-neutral unique keys", async () => {
  const client = new FakePersistOrderSnapshotClient();

  const result = await persistOrderSnapshot(
    {
      platformAccount: {
        platform: "shopify",
        platformAccountId: "gid://shopify/Shop/1",
        name: "Demo Shop",
      },
      order: {
        platformOrderId: "gid://shopify/Order/1",
        orderName: "#1001",
        createdAtPlatform: "2026-05-27T07:00:00.000Z",
        financialStatus: "partially_refunded",
        fulfillmentStatus: "fulfilled",
        totalAmount: "150.97",
        currencyCode: "HKD",
      },
      lineItems: [
        {
          platformLineItemId: "gid://shopify/LineItem/1",
          title: "Sunglasses",
          sku: "SUN-1",
          returnableQuantity: 2,
          pendingRefundQuantity: 1,
          hasReturnableFulfillment: true,
          finalSale: false,
          unitPrice: "56.99",
          currencyCode: "HKD",
        },
      ],
      refunds: [
        {
          platformRefundId: "gid://shopify/Refund/1",
          status: "pending",
          totalAmount: "56.99",
          currencyCode: "HKD",
          lineItems: [
            {
              platformRefundLineItemId:
                "gid://shopify/RefundLineItem/1",
              platformLineItemId: "gid://shopify/LineItem/1",
              quantity: 1,
              subtotalAmount: "56.99",
              currencyCode: "HKD",
            },
          ],
          transactions: [
            {
              platformRefundTransactionId:
                "gid://shopify/OrderTransaction/1",
              kind: "REFUND",
              gateway: "shopify_payments",
              status: "PENDING",
              amount: "56.99",
              currencyCode: "HKD",
            },
          ],
        },
      ],
    },
    client,
  );

  assert.equal(result.platformAccountId, "platform-account-1");
  assert.equal(result.orderId, "order-1");
  assert.equal(
    result.lineItemIdsByPlatformLineItemId.get("gid://shopify/LineItem/1"),
    "line-item:gid://shopify/LineItem/1",
  );
  assert.equal(
    result.refundIdsByPlatformRefundId.get("gid://shopify/Refund/1"),
    "refund:gid://shopify/Refund/1",
  );

  const platformAccountUpsert =
    findCall<Prisma.PlatformAccountUpsertArgs>(
      client.calls,
      "platformAccount.upsert",
    );
  assert.deepEqual(platformAccountUpsert.where, {
    platform_platformAccountId: {
      platform: "shopify",
      platformAccountId: "gid://shopify/Shop/1",
    },
  });

  const orderUpsert = findCall<Prisma.OrderUpsertArgs>(
    client.calls,
    "order.upsert",
  );
  assert.deepEqual(orderUpsert.where, {
    platformAccountId_platformOrderId: {
      platformAccountId: "platform-account-1",
      platformOrderId: "gid://shopify/Order/1",
    },
  });

  const orderLineItemUpsert = findCall<Prisma.OrderLineItemUpsertArgs>(
    client.calls,
    "orderLineItem.upsert",
  );
  assert.deepEqual(orderLineItemUpsert.where, {
    orderId_platformLineItemId: {
      orderId: "order-1",
      platformLineItemId: "gid://shopify/LineItem/1",
    },
  });

  const refundTransactionUpsert =
    findCall<Prisma.RefundTransactionUpsertArgs>(
      client.calls,
      "refundTransaction.upsert",
    );
  assert.deepEqual(refundTransactionUpsert.where, {
    refundId_platformRefundTransactionId: {
      refundId: "refund:gid://shopify/Refund/1",
      platformRefundTransactionId: "gid://shopify/OrderTransaction/1",
    },
  });

  const refundLineItemUpsert = findCall<Prisma.RefundLineItemUpsertArgs>(
    client.calls,
    "refundLineItem.upsert",
  );
  assert.deepEqual(refundLineItemUpsert.where, {
    refundId_platformRefundLineItemId: {
      refundId: "refund:gid://shopify/Refund/1",
      platformRefundLineItemId: "gid://shopify/RefundLineItem/1",
    },
  });
});

test("replaces refund line item children when no stable child ids are available", async () => {
  const client = new FakePersistOrderSnapshotClient();

  await persistOrderSnapshot(
    {
      platformAccount: {
        platform: "shopify",
        platformAccountId: "gid://shopify/Shop/1",
      },
      order: {
        platformOrderId: "gid://shopify/Order/1",
        createdAtPlatform: "2026-05-27T07:00:00.000Z",
        financialStatus: "partially_refunded",
      },
      refunds: [
        {
          platformRefundId: "gid://shopify/Refund/1",
          status: "pending",
          lineItems: [
            {
              platformLineItemId: "gid://shopify/LineItem/1",
              quantity: 1,
            },
            {
              platformLineItemId: "gid://shopify/LineItem/2",
              quantity: 2,
            },
          ],
        },
      ],
    },
    client,
  );

  const operations = client.calls.map((call) => call.operation);

  assert.deepEqual(
    operations.filter((operation) => operation.startsWith("refundLineItem.")),
    [
      "refundLineItem.deleteMany",
      "refundLineItem.create",
      "refundLineItem.create",
    ],
  );
});

test("rejects invalid platform order dates before writing", async () => {
  const client = new FakePersistOrderSnapshotClient();

  await assert.rejects(
    persistOrderSnapshot(
      {
        platformAccount: {
          platform: "shopify",
          platformAccountId: "gid://shopify/Shop/1",
        },
        order: {
          platformOrderId: "gid://shopify/Order/1",
          createdAtPlatform: "not-a-date",
          financialStatus: "paid",
        },
      },
      client,
    ),
    /order\.createdAtPlatform must be a valid date/,
  );
});
