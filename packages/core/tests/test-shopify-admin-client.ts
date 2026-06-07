import {
  createShopifyAdminClient,
  type ShopifyAdminClient,
} from "../src/platforms/shopify/shopify-admin.js";

export function createTestShopifyAdminClient(
  fetchImpl: typeof fetch,
): ShopifyAdminClient {
  return createShopifyAdminClient({
    shopDomain: "example.myshopify.com",
    accessToken: "shpat_test",
    fetchImpl,
  });
}
