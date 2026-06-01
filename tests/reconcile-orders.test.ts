import assert from "node:assert/strict";
import test from "node:test";
import type { PlatformAccount, Prisma, SyncRun } from "@prisma/client";
import {
  ORDER_RECONCILIATION_SYNC_TYPE,
  type OrderReconciliationCandidate,
  reconcileOrders,
  type ReconcileOrdersClient,
} from "../src/sync/reconcile-orders.js";

interface RecordedCall {
  operation: string;
  args: unknown;
}

class FakeReconcileOrdersClient
  implements ReconcileOrdersClient
{
  readonly calls: RecordedCall[] = [];

  readonly platformAccount = {
    upsert: async (args: Prisma.PlatformAccountUpsertArgs) => {
      this.calls.push({ operation: "platformAccount.upsert", args });

      return {
        id: "platform-account-1",
        platform: "commerce_test",
        platformAccountId: "acct_1",
        name: null,
        shopDomain: null,
        rawPayload: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      } as PlatformAccount;
    },
  };

  readonly syncRun = {
    create: async (args: Prisma.SyncRunCreateArgs) => {
      this.calls.push({ operation: "syncRun.create", args });

      return {
        id: "sync-run-1",
        platformAccountId: "platform-account-1",
        platform: "commerce_test",
        syncType: ORDER_RECONCILIATION_SYNC_TYPE,
        status: "running",
        startedAt: new Date("2026-05-29T00:00:00.000Z"),
        finishedAt: null,
        summary: null,
      } as SyncRun;
    },
    update: async (args: Prisma.SyncRunUpdateArgs) => {
      this.calls.push({ operation: "syncRun.update", args });

      return {
        id: "sync-run-1",
        platformAccountId: "platform-account-1",
        platform: "commerce_test",
        syncType: ORDER_RECONCILIATION_SYNC_TYPE,
        status: String(args.data.status),
        startedAt: new Date("2026-05-29T00:00:00.000Z"),
        finishedAt: args.data.finishedAt as Date,
        summary: args.data.summary as Prisma.JsonValue,
      } as SyncRun;
    },
  };
}

function buildOrderCandidate(id: string): OrderReconciliationCandidate {
  return { id };
}

function findCall<TArgs>(calls: RecordedCall[], operation: string): TArgs {
  const call = calls.find((recordedCall) => recordedCall.operation === operation);

  assert.ok(call, `${operation} was not called.`);

  return call.args as TArgs;
}

test("reconciles candidate orders and writes a succeeded SyncRun", async () => {
  const client = new FakeReconcileOrdersClient();
  const startedAt = new Date("2026-05-29T01:00:00.000Z");
  const finishedAt = new Date("2026-05-29T01:01:00.000Z");
  const syncedAt = new Date("2026-05-29T01:00:30.000Z");
  const syncedOrderIds: string[] = [];

  const result = await reconcileOrders(
    {
      platform: "commerce_test",
      platformAccountId: "acct_1",
      platformAccountData: {
        name: "Demo Account",
      },
      platformContext: {
        storeHandle: "demo-store",
      },
      limit: 2,
      startedAt,
      finishedAt,
      syncedAt,
    },
    {
      prisma: client,
      loadOrderCandidatesFn: async () => [
        buildOrderCandidate("platform-order-1"),
        buildOrderCandidate("platform-order-2"),
      ],
      syncOrderSnapshotFn: async (input) => {
        syncedOrderIds.push(input.orderId);
        assert.equal(input.platform, "commerce_test");
        assert.equal(input.platformAccountId, "acct_1");
        assert.deepEqual(input.platformContext, {
          storeHandle: "demo-store",
        });
        assert.equal(input.syncedAt, syncedAt);

        return {
          localOrderId: `local:${input.orderId}`,
          lineItemIdsByPlatformLineItemId: new Map([["line-item", "local-line-item"]]),
          refundIdsByPlatformRefundId: new Map([["refund", "local-refund"]]),
        };
      },
    },
  );

  assert.equal(result.status, "succeeded");
  assert.deepEqual(syncedOrderIds, [
    "platform-order-1",
    "platform-order-2",
  ]);

  const platformAccountUpsert = findCall<Prisma.PlatformAccountUpsertArgs>(
    client.calls,
    "platformAccount.upsert",
  );
  assert.deepEqual(platformAccountUpsert.where, {
    platform_platformAccountId: {
      platform: "commerce_test",
      platformAccountId: "acct_1",
    },
  });

  const syncRunCreate = findCall<Prisma.SyncRunCreateArgs>(
    client.calls,
    "syncRun.create",
  );
  assert.deepEqual(syncRunCreate.data, {
    platformAccountId: "platform-account-1",
    platform: "commerce_test",
    syncType: ORDER_RECONCILIATION_SYNC_TYPE,
    status: "running",
    startedAt,
    summary: {
      platform: "commerce_test",
      platformAccountId: "acct_1",
      platformContext: {
        storeHandle: "demo-store",
      },
      limit: 2,
    },
  });

  const syncRunUpdate = findCall<Prisma.SyncRunUpdateArgs>(
    client.calls,
    "syncRun.update",
  );
  assert.equal(syncRunUpdate.data.status, "succeeded");
  assert.equal(syncRunUpdate.data.finishedAt, finishedAt);
  assert.deepEqual(syncRunUpdate.data.summary, {
    platform: "commerce_test",
    platformAccountId: "acct_1",
    platformContext: {
      storeHandle: "demo-store",
    },
    limit: 2,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    candidateOrderCount: 2,
    syncedCount: 2,
    failedCount: 0,
    syncedOrders: [
      {
        platformOrderId: "platform-order-1",
        localOrderId: "local:platform-order-1",
        lineItemCount: 1,
        refundCount: 1,
      },
      {
        platformOrderId: "platform-order-2",
        localOrderId: "local:platform-order-2",
        lineItemCount: 1,
        refundCount: 1,
      },
    ],
    failedOrders: [],
  });
});

test("records partial reconciliation when one candidate order fails", async () => {
  const client = new FakeReconcileOrdersClient();

  const result = await reconcileOrders(
    {
      platform: "commerce_test",
      platformAccountId: "acct_1",
      startedAt: new Date("2026-05-29T01:00:00.000Z"),
      finishedAt: new Date("2026-05-29T01:01:00.000Z"),
    },
    {
      prisma: client,
      loadOrderCandidatesFn: async () => [
        buildOrderCandidate("platform-order-1"),
        buildOrderCandidate("platform-order-2"),
      ],
      syncOrderSnapshotFn: async (input) => {
        if (input.orderId === "platform-order-2") {
          throw new Error("Platform order was not found.");
        }

        return {
          localOrderId: "local-order-1",
          lineItemIdsByPlatformLineItemId: new Map(),
          refundIdsByPlatformRefundId: new Map(),
        };
      },
    },
  );

  assert.equal(result.status, "partial");
  assert.deepEqual(result.failedOrders, [
    {
      orderId: "platform-order-2",
      message: "Platform order was not found.",
    },
  ]);

  const syncRunUpdate = findCall<Prisma.SyncRunUpdateArgs>(
    client.calls,
    "syncRun.update",
  );
  const summary = syncRunUpdate.data.summary as Prisma.JsonObject;

  assert.equal(syncRunUpdate.data.status, "partial");
  assert.equal(summary.syncedCount, 1);
  assert.equal(summary.failedCount, 1);
});
