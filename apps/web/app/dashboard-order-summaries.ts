import { loadOrders, type ShopifyOrderSummary } from "@shopify-agent/core";
import type { PlatformAccount, Prisma } from "@prisma/client";
import { resolveShopifyAdminClient } from "../../../src/platforms/shopify/admin-client/resolve-admin-client";
import {
  SHOPIFY_INSTALLATION_ACTIVE_STATUS,
  type ShopifyInstallationClient,
} from "../../../src/platforms/shopify/persistence/installation";

const SHOPIFY_PLATFORM = "shopify";

export interface LoadDashboardOrderSummariesInput {
  limit: number;
  shopDomain?: string | null;
  useRealShopify: boolean;
}

interface DashboardOrderSummariesClient extends ShopifyInstallationClient {
  platformAccount: {
    findFirst(
      args: Prisma.PlatformAccountFindFirstArgs,
    ): Promise<PlatformAccount | null>;
  };
}

interface RealShopifyOrderSummariesDependencies {
  prisma: DashboardOrderSummariesClient;
  credentialEncryptionKey: Buffer;
  appClientId: string;
  appClientSecret: string;
  apiVersion: string;
  fetchImpl: typeof fetch;
  nowFn: () => Date;
}

export interface LoadDashboardOrderSummariesDependencies {
  realShopify?: RealShopifyOrderSummariesDependencies;
}

function readRequiredShopDomain(value?: string | null): string {
  const shopDomain = value?.trim().toLowerCase();

  if (!shopDomain) {
    throw new Error("Shopify shop domain is required to load live orders.");
  }

  return shopDomain;
}

function requireRealShopifyDependencies(
  dependencies: LoadDashboardOrderSummariesDependencies,
): RealShopifyOrderSummariesDependencies {
  if (!dependencies.realShopify) {
    throw new Error(
      "Real Shopify order loading requires Shopify installation dependencies.",
    );
  }

  return dependencies.realShopify;
}

async function findActiveShopifyPlatformAccount(
  shopDomain: string,
  prisma: DashboardOrderSummariesClient,
): Promise<PlatformAccount> {
  const where: Prisma.PlatformAccountWhereInput = {
    platform: SHOPIFY_PLATFORM,
    shopDomain,
    shopifyInstallation: {
      is: {
        status: SHOPIFY_INSTALLATION_ACTIVE_STATUS,
      },
    },
  };
  const localPlatformAccount = await prisma.platformAccount.findFirst({
    where,
    orderBy: {
      updatedAt: "desc",
    },
  });

  if (!localPlatformAccount) {
    throw new Error(`No active Shopify installation was found for ${shopDomain}.`);
  }

  return localPlatformAccount;
}

export async function loadDashboardOrderSummaries(
  input: LoadDashboardOrderSummariesInput,
  dependencies: LoadDashboardOrderSummariesDependencies = {},
): Promise<ShopifyOrderSummary[]> {
  if (!input.useRealShopify) {
    return loadOrders({ limit: input.limit });
  }

  const realShopifyDependencies = requireRealShopifyDependencies(dependencies);
  const shopDomain = readRequiredShopDomain(input.shopDomain);
  const localPlatformAccount = await findActiveShopifyPlatformAccount(
    shopDomain,
    realShopifyDependencies.prisma,
  );
  const shopifyAdminClient = await resolveShopifyAdminClient(
    localPlatformAccount,
    {
      prisma: realShopifyDependencies.prisma,
      credentialEncryptionKey:
        realShopifyDependencies.credentialEncryptionKey,
      appClientId: realShopifyDependencies.appClientId,
      appClientSecret: realShopifyDependencies.appClientSecret,
      apiVersion: realShopifyDependencies.apiVersion,
      fetchImpl: realShopifyDependencies.fetchImpl,
      nowFn: realShopifyDependencies.nowFn,
    },
  );

  return loadOrders(
    {
      limit: input.limit,
    },
    {
      env: {
        USE_REAL_SHOPIFY: "true",
      },
      shopifyAdminClient,
    },
  );
}
