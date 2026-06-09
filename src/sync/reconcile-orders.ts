import { getErrorMessage, normalizePositiveInteger } from "@shopify-agent/core";
import type { PlatformAccount, Prisma, SyncRun } from "@prisma/client";

export const ORDER_RECONCILIATION_SYNC_TYPE = "order_reconciliation";

export interface ReconcileOrdersInput {
  platform: string;
  platformAccountId: string;
  platformAccountData?: ReconcilePlatformAccountData;
  platformContext?: Prisma.InputJsonObject;
  limit?: number;
  startedAt?: Date;
  finishedAt?: Date;
  syncedAt?: Date;
}

export interface PlatformReconciliationInput {
  platformAccountId: string;
  platformAccountData: ReconcilePlatformAccountData;
  platformContext?: Prisma.InputJsonObject;
}

export interface OrderReconciliationCandidate {
  platformOrderId: string;
}

export interface ReconcileOrdersLoadInput {
  limit: number;
}

export interface ReconciledOrder {
  platformOrderId: string;
  localOrderId: string;
  lineItemCount: number;
  refundCount: number;
}

export interface FailedOrderReconciliation {
  platformOrderId: string;
  message: string;
}

interface BuildReconciliationSummaryInput {
  platform: string;
  platformAccountId: string;
  platformContext?: Prisma.InputJsonObject;
  limit: number;
  startedAt: Date;
  finishedAt: Date;
  candidateOrderCount: number;
  syncedOrders: ReconciledOrder[];
  failedOrders: FailedOrderReconciliation[];
}

export type ReconcileOrdersStatus = "succeeded" | "partial" | "failed";

export interface ReconcileOrdersResult {
  localSyncRunId: string;
  localPlatformAccountId: string;
  status: ReconcileOrdersStatus;
  candidateOrderCount: number;
  syncedOrders: ReconciledOrder[];
  failedOrders: FailedOrderReconciliation[];
}

export interface ReconcileOrdersClient {
  platformAccount: {
    upsert(args: Prisma.PlatformAccountUpsertArgs): Promise<PlatformAccount>;
  };
  syncRun: {
    create(args: Prisma.SyncRunCreateArgs): Promise<SyncRun>;
    update(args: Prisma.SyncRunUpdateArgs): Promise<SyncRun>;
  };
}

export type ReconcilePlatformAccountData = Omit<
  Prisma.PlatformAccountUncheckedCreateInput,
  "id" | "platform" | "platformAccountId" | "createdAt" | "updatedAt"
>;

export interface ReconcileOrderSnapshotInput {
  platform: string;
  platformAccountId: string;
  platformOrderId: string;
  platformContext?: Prisma.InputJsonObject;
  syncedAt?: Date;
}

export interface ReconcileOrderSnapshotResult {
  localOrderId: string; // local Postgres ID
  lineItemCount: number;
  refundCount: number;
}

export interface ReconcileOrdersDependencies {
  prisma: ReconcileOrdersClient;
  loadOrderCandidatesFn: (
    input: ReconcileOrdersLoadInput,
  ) => Promise<OrderReconciliationCandidate[]>;
  syncOrderSnapshotFn: (
    input: ReconcileOrderSnapshotInput,
  ) => Promise<ReconcileOrderSnapshotResult>;
}

const DEFAULT_RECONCILE_ORDER_LIMIT = 25;

function deriveReconciliationStatus(
  candidateOrderCount: number,
  failedOrderCount: number,
): ReconcileOrdersStatus {
  if (failedOrderCount === 0) {
    return "succeeded";
  }

  if (failedOrderCount === candidateOrderCount) {
    return "failed";
  }

  return "partial";
}

function buildSummary(
  input: BuildReconciliationSummaryInput,
): Prisma.InputJsonObject {
  const syncedOrders: Prisma.InputJsonArray = input.syncedOrders.map(
    (order) => ({
      platformOrderId: order.platformOrderId,
      localOrderId: order.localOrderId,
      lineItemCount: order.lineItemCount,
      refundCount: order.refundCount,
    }),
  );
  const failedOrders: Prisma.InputJsonArray = input.failedOrders.map(
    (order) => ({
      platformOrderId: order.platformOrderId,
      message: order.message,
    }),
  );

  return {
    platform: input.platform,
    platformAccountId: input.platformAccountId,
    ...(input.platformContext
      ? { platformContext: input.platformContext }
      : {}),
    limit: input.limit,
    startedAt: input.startedAt.toISOString(),
    finishedAt: input.finishedAt.toISOString(),
    candidateOrderCount: input.candidateOrderCount,
    syncedCount: input.syncedOrders.length,
    failedCount: input.failedOrders.length,
    syncedOrders,
    failedOrders,
  };
}

async function upsertPlatformAccount(
  input: ReconcileOrdersInput,
  prisma: ReconcileOrdersClient,
): Promise<PlatformAccount> {
  const platformAccountWhere: Prisma.PlatformAccountWhereUniqueInput = {
    platform_platformAccountId: {
      platform: input.platform,
      platformAccountId: input.platformAccountId,
    },
  };
  const platformAccountData: Prisma.PlatformAccountUncheckedCreateInput = {
    platform: input.platform,
    platformAccountId: input.platformAccountId,
    ...input.platformAccountData,
  };

  return prisma.platformAccount.upsert({
    where: platformAccountWhere,
    create: platformAccountData,
    update: input.platformAccountData ?? {},
  });
}

export async function reconcileOrders(
  input: ReconcileOrdersInput,
  dependencies: ReconcileOrdersDependencies,
): Promise<ReconcileOrdersResult> {
  const limit = normalizePositiveInteger(
    input.limit ?? DEFAULT_RECONCILE_ORDER_LIMIT,
    "limit",
  );
  const startedAt = input.startedAt ?? new Date();
  const localPlatformAccount = await upsertPlatformAccount(
    input,
    dependencies.prisma,
  );

  const localSyncRun = await dependencies.prisma.syncRun.create({
    data: {
      platformAccountId: localPlatformAccount.id,
      platform: input.platform,
      syncType: ORDER_RECONCILIATION_SYNC_TYPE,
      status: "running",
      startedAt,
      summary: {
        platform: input.platform,
        platformAccountId: input.platformAccountId,
        ...(input.platformContext
          ? { platformContext: input.platformContext }
          : {}),
        limit,
      },
    },
  });
  const loadOrderCandidatesFn = dependencies.loadOrderCandidatesFn;
  const syncOrderSnapshotFn = dependencies.syncOrderSnapshotFn;
  const syncedOrders: ReconciledOrder[] = [];
  const failedOrders: FailedOrderReconciliation[] = [];

  let candidateOrderCount = 0;

  try {
    const candidateOrders = await loadOrderCandidatesFn({ limit });
    candidateOrderCount = candidateOrders.length;

    for (const order of candidateOrders) {
      try {
        const orderSnapshotInput: ReconcileOrderSnapshotInput = {
          platform: input.platform,
          platformAccountId: input.platformAccountId,
          platformOrderId: order.platformOrderId,
          platformContext: input.platformContext,
          syncedAt: input.syncedAt,
        };
        const orderSnapshotResult =
          await syncOrderSnapshotFn(orderSnapshotInput);

        syncedOrders.push({
          platformOrderId: order.platformOrderId,
          localOrderId: orderSnapshotResult.localOrderId,
          lineItemCount: orderSnapshotResult.lineItemCount,
          refundCount: orderSnapshotResult.refundCount,
        });
      } catch (error) {
        failedOrders.push({
          platformOrderId: order.platformOrderId,
          message: getErrorMessage(error),
        });
      }
    }
  } catch (error) {
    candidateOrderCount = 1;
    failedOrders.push({
      platformOrderId: "*",
        message: getErrorMessage(error),
    });
  }

  const finishedAt = input.finishedAt ?? new Date();
  const status: ReconcileOrdersStatus = deriveReconciliationStatus(
    candidateOrderCount,
    failedOrders.length,
  );
  const summaryInput: BuildReconciliationSummaryInput = {
    platform: input.platform,
    platformAccountId: input.platformAccountId,
    platformContext: input.platformContext,
    limit,
    startedAt,
    finishedAt,
    candidateOrderCount,
    syncedOrders,
    failedOrders,
  };
  const summary = buildSummary(summaryInput);

  const syncRunUpdateArgs: Prisma.SyncRunUpdateArgs = {
    where: {
      id: localSyncRun.id,
    },
    data: {
      status,
      finishedAt,
      summary,
    },
  };

  await dependencies.prisma.syncRun.update(syncRunUpdateArgs);

  return {
    localSyncRunId: localSyncRun.id,
    localPlatformAccountId: localPlatformAccount.id,
    status,
    candidateOrderCount,
    syncedOrders,
    failedOrders,
  };
}
