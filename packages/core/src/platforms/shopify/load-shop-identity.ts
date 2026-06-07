import type { ShopifyAdminClient } from "./shopify-admin.js";
import {
  normalizeOptionalString,
  normalizeRequiredString,
} from "../../shared/normalize-value.js";

const SHOPIFY_SHOP_IDENTITY_QUERY = /* GraphQL */ `
  query ShopifyShopIdentity {
    shop {
      id
      myshopifyDomain
      name
    }
  }
`;

export interface ShopifyShopIdentity {
  id: string;
  myshopifyDomain: string;
  name?: string;
}

interface ShopifyShopIdentityResponse {
  shop: {
    id?: string | null;
    myshopifyDomain?: string | null;
    name?: string | null;
  };
}

export async function loadShopifyShopIdentity(
  shopifyAdminClient: ShopifyAdminClient,
): Promise<ShopifyShopIdentity> {
  const response = await shopifyAdminClient.fetch<ShopifyShopIdentityResponse>(
    SHOPIFY_SHOP_IDENTITY_QUERY,
    {},
  );

  return {
    id: normalizeRequiredString(response.shop.id, "shop.id"),
    myshopifyDomain: normalizeRequiredString(
      response.shop.myshopifyDomain,
      "shop.myshopifyDomain",
    ),
    name: normalizeOptionalString(response.shop.name),
  };
}
