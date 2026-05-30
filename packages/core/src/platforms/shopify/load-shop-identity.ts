import {
  hasShopifyAdminConfig,
  shopifyAdminFetch,
  type ShopifyAdminFetchOptions,
} from "./shopify-admin.js";

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

function normalizeRequiredString(value: string | null | undefined, name: string) {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    throw new Error(`Shopify shop identity response missing ${name}.`);
  }

  return normalizedValue;
}

function normalizeOptionalString(value?: string | null): string | undefined {
  const normalizedValue = value?.trim();

  return normalizedValue ? normalizedValue : undefined;
}

export async function loadShopifyShopIdentity(
  dependencies: ShopifyAdminFetchOptions = {},
): Promise<ShopifyShopIdentity> {
  if (!hasShopifyAdminConfig(dependencies.env)) {
    throw new Error(
      "Shopify shop identity requires SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN.",
    );
  }

  const response = await shopifyAdminFetch<ShopifyShopIdentityResponse>(
    SHOPIFY_SHOP_IDENTITY_QUERY,
    {},
    dependencies,
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
