import {
  getErrorMessage,
  normalizePositiveInteger,
} from "@shopify-agent/core";
import type { PlatformAccount, Prisma, PrismaClient } from "@prisma/client";
import { resolveShopifyAdminClient } from "../admin-client/resolve-admin-client.js";
import { SHOPIFY_INSTALLATION_ACTIVE_STATUS } from "../persistence/installation.js";
import {
  createShopifyReconcileOrdersDependencies,
  loadShopifyReconciliationInput,
} from "./reconcile-orders-adapter.js";
import {
  reconcileOrders,
  type PlatformReconciliationInput,
  type ReconcileOrdersInput,
  type ReconcileOrdersResult,
} from "../../../sync/reconcile-orders.js";

const SHOPIFY_PLATFORM = "shopify";

export type ActiveShopifyReconciliationInstallation =
  Prisma.ShopifyInstallationGetPayload<{
    include: {
      platformAccount: true;
    };
  }>;

export interface FindActiveShopifyReconciliationInstallationsInput {
  limit?: number;
}

export interface ReconcileInstalledShopifyShopsInput {
  orderLimit?: number;
  shopLimit?: number;
}

export interface ReconcileInstalledShopifyShopsDependencies {
  prisma: PrismaClient;
  credentialEncryptionKey: Buffer;
  appClientId: string;
  appClientSecret: string;
  apiVersion?: string;
  fetchImpl: typeof fetch;
  nowFn?: () => Date;
}

export interface ReconciledShopifyInstallation {
  localPlatformAccountId: string;
  platformAccountId: string;
  shopDomain: string | null;
  reconciliation: ReconcileOrdersResult;
}

export interface FailedShopifyInstallationReconciliation {
  localPlatformAccountId: string;
  platformAccountId: string;
  shopDomain: string | null;
  message: string;
}

export interface ReconcileInstalledShopifyShopsResult {
  candidateInstallationCount: number;
  reconciledInstallations: ReconciledShopifyInstallation[];
  failedInstallations: FailedShopifyInstallationReconciliation[];
}

export async function findActiveShopifyReconciliationInstallations(
  input: FindActiveShopifyReconciliationInstallationsInput,
  prisma: PrismaClient,
): Promise<ActiveShopifyReconciliationInstallation[]> {
  const take =
    input.limit === undefined
      ? undefined
      : normalizePositiveInteger(input.limit, "shopLimit");

  return prisma.shopifyInstallation.findMany({
    where: {
      status: SHOPIFY_INSTALLATION_ACTIVE_STATUS,
      platformAccount: {
        platform: SHOPIFY_PLATFORM,
      },
    },
    include: {
      platformAccount: true,
    },
    orderBy: {
      installedAt: "asc",
    },
    ...(take !== undefined ? { take } : {}),
  });
}

function assertReconciliationInputMatchesInstallation(
  localPlatformAccount: PlatformAccount,
  platformInput: PlatformReconciliationInput,
): void {
  if (platformInput.platformAccountId !== localPlatformAccount.platformAccountId) {
    throw new Error(
      `Shopify reconciliation identity mismatch for platform account ${localPlatformAccount.id}.`,
    );
  }

  const localShopDomain = localPlatformAccount.shopDomain?.trim().toLowerCase();
  const reconciliationShopDomain =
    typeof platformInput.platformAccountData.shopDomain === "string"
      ? platformInput.platformAccountData.shopDomain.trim().toLowerCase()
      : null;

  if (
    localShopDomain &&
    reconciliationShopDomain &&
    localShopDomain !== reconciliationShopDomain
  ) {
    throw new Error(
      `Shopify reconciliation shop domain mismatch for platform account ${localPlatformAccount.id}.`,
    );
  }
}

async function reconcileInstalledShopifyInstallation(
  installation: ActiveShopifyReconciliationInstallation,
  input: ReconcileInstalledShopifyShopsInput,
  dependencies: ReconcileInstalledShopifyShopsDependencies,
): Promise<ReconciledShopifyInstallation> {
  const localPlatformAccount = installation.platformAccount;
  const shopifyAdminClient = await resolveShopifyAdminClient(
    localPlatformAccount,
    {
      prisma: dependencies.prisma,
      credentialEncryptionKey: dependencies.credentialEncryptionKey,
      appClientId: dependencies.appClientId,
      appClientSecret: dependencies.appClientSecret,
      apiVersion: dependencies.apiVersion,
      fetchImpl: dependencies.fetchImpl,
      nowFn: dependencies.nowFn,
    },
  );
  const platformInput = await loadShopifyReconciliationInput(
    shopifyAdminClient,
  );

  assertReconciliationInputMatchesInstallation(
    localPlatformAccount,
    platformInput,
  );

  const reconcileInput: ReconcileOrdersInput = {
    platform: SHOPIFY_PLATFORM,
    platformAccountId: platformInput.platformAccountId,
    platformAccountData: platformInput.platformAccountData,
    platformContext: platformInput.platformContext,
    limit: input.orderLimit,
  };
  const reconciliation = await reconcileOrders(
    reconcileInput,
    createShopifyReconcileOrdersDependencies(
      dependencies.prisma,
      shopifyAdminClient,
    ),
  );

  return {
    localPlatformAccountId: localPlatformAccount.id,
    platformAccountId: localPlatformAccount.platformAccountId,
    shopDomain: localPlatformAccount.shopDomain,
    reconciliation,
  };
}

export async function reconcileInstalledShopifyShops(
  input: ReconcileInstalledShopifyShopsInput,
  dependencies: ReconcileInstalledShopifyShopsDependencies,
): Promise<ReconcileInstalledShopifyShopsResult> {
  const installations = await findActiveShopifyReconciliationInstallations(
    {
      limit: input.shopLimit,
    },
    dependencies.prisma,
  );
  const reconciledInstallations: ReconciledShopifyInstallation[] = [];
  const failedInstallations: FailedShopifyInstallationReconciliation[] = [];

  for (const installation of installations) {
    const localPlatformAccount = installation.platformAccount;

    try {
      const reconciledInstallation =
        await reconcileInstalledShopifyInstallation(
          installation,
          input,
          dependencies,
        );

      reconciledInstallations.push(reconciledInstallation);
    } catch (error) {
      failedInstallations.push({
        localPlatformAccountId: localPlatformAccount.id,
        platformAccountId: localPlatformAccount.platformAccountId,
        shopDomain: localPlatformAccount.shopDomain,
        message: getErrorMessage(error),
      });
    }
  }

  return {
    candidateInstallationCount: installations.length,
    reconciledInstallations,
    failedInstallations,
  };
}
