import {
  createShopifyAdminClient,
  readRequiredStringEnv,
  type ShopifyAdminClient,
} from "@shopify-agent/core";

export function createShopifyAdminClientFromEnv(
  fetchImpl: typeof fetch,
  env: NodeJS.ProcessEnv = process.env,
): ShopifyAdminClient {
  return createShopifyAdminClient({
    shopDomain: readRequiredStringEnv("SHOPIFY_STORE_DOMAIN", env),
    accessToken: readRequiredStringEnv("SHOPIFY_ADMIN_TOKEN", env),
    apiVersion: env.SHOPIFY_API_VERSION,
    fetchImpl,
  });
}
