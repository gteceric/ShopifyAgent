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

export interface OrderReconciliationCandidate {
  id: string;
}

export interface ReconcileOrdersLoadInput {
  limit: number;
}

export interface ReconciledOrder {
  orderId: string;
  localOrderId: string;
  lineItemCount: number;
  refundCount: number;
}

export interface FailedOrderReconciliation {
  orderId: string;
  message: string;
}

export type ReconcileOrdersStatus = "succeeded" | "partial" | "failed";

export interface ReconcileOrdersResult {
  syncRunId: string;
  platformAccountId: string;
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
  orderId: string;
  platformContext?: Prisma.InputJsonObject;
  syncedAt?: Date;
}

export interface ReconcileOrderSnapshotResult {
  orderId: string;
  lineItemIdsByPlatformLineItemId: Map<string, string>;
  refundIdsByPlatformRefundId: Map<string, string>;
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

function normalizeLimit(limit?: number): number {
  if (limit === undefined) {
    return DEFAULT_RECONCILE_ORDER_LIMIT;
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("limit must be a positive integer.");
  }

  return limit;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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

function buildSummary(input: {
  platform: string;
  platformAccountId: string;
  platformContext?: Prisma.InputJsonObject;
  limit: number;
  startedAt: Date;
  finishedAt: Date;
  candidateOrderCount: number;
  syncedOrders: ReconciledOrder[];
  failedOrders: FailedOrderReconciliation[];
}): Prisma.InputJsonObject {
  const syncedOrders: Prisma.InputJsonArray = input.syncedOrders.map(
    (order) => ({
      orderId: order.orderId,
      localOrderId: order.localOrderId,
      lineItemCount: order.lineItemCount,
      refundCount: order.refundCount,
    }),
  );
  const failedOrders: Prisma.InputJsonArray = input.failedOrders.map(
    (order) => ({
      orderId: order.orderId,
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
  const limit = normalizeLimit(input.limit);
  const startedAt = input.startedAt ?? new Date();
  const platformAccount = await upsertPlatformAccount(
    input,
    dependencies.prisma,
  );

  // Prisma inserts a DB row and return the new row as js object
  const syncRun = await dependencies.prisma.syncRun.create({
    data: {
      platformAccountId: platformAccount.id,
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
  const loadCandidateOrdersFn = dependencies.loadOrderCandidatesFn;
  const syncOrderFn = dependencies.syncOrderSnapshotFn;
  const syncedOrders: ReconciledOrder[] = [];
  const failedOrders: FailedOrderReconciliation[] = [];

  let candidateOrderCount = 0;

  try {
    const candidateOrders = await loadCandidateOrdersFn({ limit });
    candidateOrderCount = candidateOrders.length;

    for (const order of candidateOrders) {
      try {
        const syncResult = await syncOrderFn({
          platform: input.platform,
          platformAccountId: input.platformAccountId,
          orderId: order.id,
          platformContext: input.platformContext,
          syncedAt: input.syncedAt,
        });

        syncedOrders.push({
          orderId: order.id,
          localOrderId: syncResult.orderId,
          lineItemCount: syncResult.lineItemIdsByPlatformLineItemId.size,
          refundCount: syncResult.refundIdsByPlatformRefundId.size,
        });
      } catch (error) {
        failedOrders.push({
          orderId: order.id,
          message: errorMessage(error),
        });
      }
    }
  } catch (error) {
    candidateOrderCount = 1;
    failedOrders.push({
      orderId: "*",
      message: errorMessage(error),
    });
  }

  const finishedAt = input.finishedAt ?? new Date();
  const status = deriveReconciliationStatus(
    candidateOrderCount,
    failedOrders.length,
  );
  const summary = buildSummary({
    platform: input.platform,
    platformAccountId: input.platformAccountId,
    platformContext: input.platformContext,
    limit,
    startedAt,
    finishedAt,
    candidateOrderCount,
    syncedOrders,
    failedOrders,
  });

  await dependencies.prisma.syncRun.update({
    where: {
      id: syncRun.id,
    },
    data: {
      status,
      finishedAt,
      summary,
    },
  });

  return {
    syncRunId: syncRun.id,
    platformAccountId: platformAccount.id,
    status,
    candidateOrderCount,
    syncedOrders,
    failedOrders,
  };
}
