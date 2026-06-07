import {
  createShopifyAdminClient,
  type ShopifyAdminClient,
} from "@shopify-agent/core";

function readRequiredEnv(
  env: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required to create a Shopify Admin client.`);
  }

  return value;
}

export function createShopifyAdminClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl?: typeof fetch,
): ShopifyAdminClient {
  return createShopifyAdminClient({
    shopDomain: readRequiredEnv(env, "SHOPIFY_STORE_DOMAIN"),
    accessToken: readRequiredEnv(env, "SHOPIFY_ADMIN_TOKEN"),
    apiVersion: env.SHOPIFY_API_VERSION,
    fetchImpl,
  });
}
