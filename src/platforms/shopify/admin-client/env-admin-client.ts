import {
  createShopifyAdminClient,
  normalizeRequiredString,
  type ShopifyAdminClient,
} from "@shopify-agent/core";

export function createShopifyAdminClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl?: typeof fetch,
): ShopifyAdminClient {
  return createShopifyAdminClient({
    shopDomain: normalizeRequiredString(
      env.SHOPIFY_STORE_DOMAIN,
      "SHOPIFY_STORE_DOMAIN",
    ),
    accessToken: normalizeRequiredString(
      env.SHOPIFY_ADMIN_TOKEN,
      "SHOPIFY_ADMIN_TOKEN",
    ),
    apiVersion: env.SHOPIFY_API_VERSION,
    fetchImpl,
  });
}
