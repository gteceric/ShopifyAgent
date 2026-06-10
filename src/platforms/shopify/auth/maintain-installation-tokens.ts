import { getErrorMessage, normalizePositiveInteger } from "@shopify-agent/core";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  SHOPIFY_INSTALLATION_ACTIVE_STATUS,
  type ShopifyInstallationClient,
} from "../persistence/installation.js";
import {
  refreshShopifyInstallationTokens,
  type RefreshShopifyInstallationTokensDependencies,
  type RefreshShopifyInstallationTokensInput,
} from "./refresh-installation-tokens.js";

const DEFAULT_REFRESH_WINDOW_DAYS = 30;
const DEFAULT_TOKEN_MAINTENANCE_BATCH_SIZE = 100;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;

export type ShopifyTokenMaintenanceCandidate =
  Prisma.ShopifyInstallationGetPayload<{
    include: {
      platformAccount: true;
    };
  }>;

export interface FindShopifyInstallationsDueForTokenRefreshInput {
  batchSize: number;
  refreshBefore: Date;
}

export interface MaintainShopifyInstallationTokensInput {
  batchSize?: number;
  refreshWindowDays?: number;
}

export interface MaintainShopifyInstallationTokensDependencies
  extends Omit<RefreshShopifyInstallationTokensDependencies, "prisma"> {
  prisma: ShopifyInstallationClient;
  findCandidatesFn: (
    input: FindShopifyInstallationsDueForTokenRefreshInput,
  ) => Promise<ShopifyTokenMaintenanceCandidate[]>;
  refreshInstallationTokensFn: typeof refreshShopifyInstallationTokens;
}

export interface RefreshedShopifyInstallationSummary {
  localPlatformAccountId: string;
  shopDomain: string;
}

export interface FailedShopifyInstallationRefresh {
  localPlatformAccountId: string;
  shopDomain: string | null;
  message: string;
}

export interface MaintainShopifyInstallationTokensResult {
  candidateCount: number;
  refreshBefore: Date;
  refreshedInstallations: RefreshedShopifyInstallationSummary[];
  failedInstallations: FailedShopifyInstallationRefresh[];
}

export async function findShopifyInstallationsDueForTokenRefresh(
  input: FindShopifyInstallationsDueForTokenRefreshInput,
  prisma: PrismaClient,
): Promise<ShopifyTokenMaintenanceCandidate[]> {
  return prisma.shopifyInstallation.findMany({
    where: {
      status: SHOPIFY_INSTALLATION_ACTIVE_STATUS,
      refreshTokenExpiresAt: {
        lte: input.refreshBefore,
      },
    },
    include: {
      platformAccount: true,
    },
    orderBy: {
      refreshTokenExpiresAt: "asc",
    },
    take: input.batchSize,
  });
}

export async function maintainShopifyInstallationTokens(
  input: MaintainShopifyInstallationTokensInput,
  dependencies: MaintainShopifyInstallationTokensDependencies,
): Promise<MaintainShopifyInstallationTokensResult> {
  const batchSize = normalizePositiveInteger(
    input.batchSize ?? DEFAULT_TOKEN_MAINTENANCE_BATCH_SIZE,
    "batchSize",
  );
  const refreshWindowDays = normalizePositiveInteger(
    input.refreshWindowDays ?? DEFAULT_REFRESH_WINDOW_DAYS,
    "refreshWindowDays",
  );
  const now = dependencies.nowFn?.() ?? new Date();
  const refreshBefore = new Date(
    now.getTime() + refreshWindowDays * MILLISECONDS_PER_DAY,
  );
  const candidates = await dependencies.findCandidatesFn({
    batchSize,
    refreshBefore,
  });
  const refreshedInstallations: RefreshedShopifyInstallationSummary[] = [];
  const failedInstallations: FailedShopifyInstallationRefresh[] = [];

  for (const candidate of candidates) {
    const shopDomain = candidate.platformAccount.shopDomain?.trim() || null;

    try {
      if (!candidate.encryptedRefreshToken) {
        throw new Error(
          `Shopify installation ${candidate.id} has no refresh token.`,
        );
      }

      if (!shopDomain) {
        throw new Error(
          `Shopify platform account ${candidate.platformAccountId} has no shop domain.`,
        );
      }

      const refreshInput: RefreshShopifyInstallationTokensInput = {
        localPlatformAccountId: candidate.platformAccountId,
        shopDomain,
        encryptedRefreshToken: candidate.encryptedRefreshToken,
        refreshTokenExpiresAt: candidate.refreshTokenExpiresAt,
      };

      await dependencies.refreshInstallationTokensFn(refreshInput, {
        prisma: dependencies.prisma,
        credentialEncryptionKey: dependencies.credentialEncryptionKey,
        appClientId: dependencies.appClientId,
        appClientSecret: dependencies.appClientSecret,
        fetchImpl: dependencies.fetchImpl,
        nowFn: dependencies.nowFn,
      });

      refreshedInstallations.push({
        localPlatformAccountId: candidate.platformAccountId,
        shopDomain,
      });
    } catch (error) {
      failedInstallations.push({
        localPlatformAccountId: candidate.platformAccountId,
        shopDomain,
        message: getErrorMessage(error),
      });
    }
  }

  return {
    candidateCount: candidates.length,
    refreshBefore,
    refreshedInstallations,
    failedInstallations,
  };
}
