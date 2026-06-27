import {
  loadOrders,
  type ShopifyAdminClient,
  type ShopifyOrderSummary,
} from "@shopify-agent/core";
import type { PlatformAccount, Prisma } from "@prisma/client";
import { resolveShopifyAdminClient } from "../../../src/platforms/shopify/admin-client/resolve-admin-client";
import { type ShopifyInstallationClient } from "../../../src/platforms/shopify/persistence/installation";

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
  shopifyAdminClient: ShopifyAdminClient;
}

interface ResolveDashboardShopifyAdminClientDependencies {
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

async function findShopifyPlatformAccount(
  shopDomain: string,
  prisma: DashboardOrderSummariesClient,
): Promise<PlatformAccount> {
  const where: Prisma.PlatformAccountWhereInput = {
    platform: SHOPIFY_PLATFORM,
    shopDomain,
  };

  // Find the Shopify platform account for this shop,
  // regardless of installation status.
  const localPlatformAccount = await prisma.platformAccount.findFirst({
    where,
    orderBy: {
      updatedAt: "desc",
    },
  });

  if (!localPlatformAccount) {
    throw new Error(`No Shopify installation was found for ${shopDomain}.`);
  }

  return localPlatformAccount;
}

export async function resolveDashboardShopifyAdminClient(
  input: Pick<LoadDashboardOrderSummariesInput, "shopDomain">,
  dependencies: ResolveDashboardShopifyAdminClientDependencies,
): Promise<ShopifyAdminClient> {
  const shopDomain = readRequiredShopDomain(input.shopDomain);
  const localPlatformAccount = await findShopifyPlatformAccount(
    shopDomain,
    dependencies.prisma,
  );

  return resolveShopifyAdminClient(localPlatformAccount, {
    prisma: dependencies.prisma,
    credentialEncryptionKey: dependencies.credentialEncryptionKey,
    appClientId: dependencies.appClientId,
    appClientSecret: dependencies.appClientSecret,
    apiVersion: dependencies.apiVersion,
    fetchImpl: dependencies.fetchImpl,
    nowFn: dependencies.nowFn,
  });
}

export async function loadDashboardOrderSummaries(
  input: LoadDashboardOrderSummariesInput,
  dependencies: LoadDashboardOrderSummariesDependencies = {},
): Promise<ShopifyOrderSummary[]> {
  if (!input.useRealShopify) {
    return loadOrders({ limit: input.limit });
  }

  const realShopifyDependencies = requireRealShopifyDependencies(dependencies);

  return loadOrders(
    {
      limit: input.limit,
    },
    {
      useRealShopify: input.useRealShopify,
      shopifyAdminClient: realShopifyDependencies.shopifyAdminClient,
    },
  );
}
