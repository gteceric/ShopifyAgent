import type { PlatformAccount, Prisma } from "@prisma/client";
import {
  normalizeOptionalString,
  normalizeRequiredString,
} from "../../../persistence/normalize-persistence-value.js";

const SHOPIFY_PLATFORM = "shopify";

export interface UpsertShopifyPlatformAccountInput {
  platformAccountId: string;
  shopDomain: string;
  name?: string | null;
}

export interface ShopifyPlatformAccountClient {
  platformAccount: {
    upsert(args: Prisma.PlatformAccountUpsertArgs): Promise<PlatformAccount>;
  };
}

export async function upsertShopifyPlatformAccount(
  input: UpsertShopifyPlatformAccountInput,
  client: ShopifyPlatformAccountClient,
): Promise<PlatformAccount> {
  const platformAccountId = normalizeRequiredString(
    input.platformAccountId,
    "platformAccountId",
  );
  const platformAccountData: Prisma.PlatformAccountUncheckedCreateInput = {
    platform: SHOPIFY_PLATFORM,
    platformAccountId,
    name: normalizeOptionalString(input.name),
    shopDomain: normalizeRequiredString(input.shopDomain, "shopDomain"),
  };

  return client.platformAccount.upsert({
    where: {
      platform_platformAccountId: {
        platform: SHOPIFY_PLATFORM,
        platformAccountId,
      },
    },
    create: platformAccountData,
    update: platformAccountData,
  });
}
