import type { Prisma, ShopifyInstallation } from "@prisma/client";
import {
  normalizeOptionalDate,
  normalizeRequiredDate,
  normalizeRequiredString,
} from "./normalize-persistence-value.js";

export const SHOPIFY_INSTALLATION_ACTIVE_STATUS = "active";
export const SHOPIFY_INSTALLATION_INACTIVE_STATUS = "inactive";

export type ShopifyInstallationStatus =
  | typeof SHOPIFY_INSTALLATION_ACTIVE_STATUS
  | typeof SHOPIFY_INSTALLATION_INACTIVE_STATUS;

export interface PersistShopifyInstallationInput {
  localPlatformAccountId: string;
  status: ShopifyInstallationStatus;
  encryptedAccessToken?: string | null;
  encryptedRefreshToken?: string | null;
  accessTokenExpiresAt?: Date | string | null;
  refreshTokenExpiresAt?: Date | string | null;
  grantedScopes: readonly string[];
  installedAt: Date | string;
  uninstalledAt?: Date | string | null;
}

export interface DeactivateShopifyInstallationInput {
  localPlatformAccountId: string;
  uninstalledAt: Date | string;
}

export interface ShopifyInstallationClient {
  shopifyInstallation: {
    findUnique(
      args: Prisma.ShopifyInstallationFindUniqueArgs,
    ): Promise<ShopifyInstallation | null>;
    update(
      args: Prisma.ShopifyInstallationUpdateArgs,
    ): Promise<ShopifyInstallation>;
    upsert(
      args: Prisma.ShopifyInstallationUpsertArgs,
    ): Promise<ShopifyInstallation>;
  };
}

function normalizeOptionalEncryptedValue(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return value.trim() ? value : null;
}

function normalizeGrantedScopes(scopes: readonly string[]): string[] {
  return [
    ...new Set(
      scopes.map((scope) => scope.trim()).filter((scope) => scope.length > 0),
    ),
  ].sort();
}

export async function persistShopifyInstallation(
  input: PersistShopifyInstallationInput,
  client: ShopifyInstallationClient,
): Promise<ShopifyInstallation> {
  const localPlatformAccountId = normalizeRequiredString(
    input.localPlatformAccountId,
    "localPlatformAccountId",
  );
  const data = {
    platformAccountId: localPlatformAccountId,
    status: input.status,
    encryptedAccessToken: normalizeOptionalEncryptedValue(
      input.encryptedAccessToken,
    ),
    encryptedRefreshToken: normalizeOptionalEncryptedValue(
      input.encryptedRefreshToken,
    ),
    accessTokenExpiresAt: normalizeOptionalDate(
      input.accessTokenExpiresAt,
      "accessTokenExpiresAt",
    ),
    refreshTokenExpiresAt: normalizeOptionalDate(
      input.refreshTokenExpiresAt,
      "refreshTokenExpiresAt",
    ),
    grantedScopes: normalizeGrantedScopes(input.grantedScopes),
    installedAt: normalizeRequiredDate(input.installedAt, "installedAt"),
    uninstalledAt: normalizeOptionalDate(
      input.uninstalledAt,
      "uninstalledAt",
    ),
  } satisfies Prisma.ShopifyInstallationUncheckedCreateInput;

  return client.shopifyInstallation.upsert({
    where: {
      platformAccountId: localPlatformAccountId,
    },
    create: data,
    update: data,
  });
}

export async function findShopifyInstallation(
  localPlatformAccountId: string,
  client: ShopifyInstallationClient,
): Promise<ShopifyInstallation | null> {
  return client.shopifyInstallation.findUnique({
    where: {
      platformAccountId: normalizeRequiredString(
        localPlatformAccountId,
        "localPlatformAccountId",
      ),
    },
  });
}

export async function deactivateShopifyInstallation(
  input: DeactivateShopifyInstallationInput,
  client: ShopifyInstallationClient,
): Promise<ShopifyInstallation> {
  const localPlatformAccountId = normalizeRequiredString(
    input.localPlatformAccountId,
    "localPlatformAccountId",
  );

  return client.shopifyInstallation.update({
    where: {
      platformAccountId: localPlatformAccountId,
    },
    data: {
      status: SHOPIFY_INSTALLATION_INACTIVE_STATUS,
      encryptedAccessToken: null,
      encryptedRefreshToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      uninstalledAt: normalizeRequiredDate(
        input.uninstalledAt,
        "uninstalledAt",
      ),
    },
  });
}
