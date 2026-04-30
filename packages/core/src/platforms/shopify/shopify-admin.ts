const DEFAULT_SHOPIFY_API_VERSION = "2026-01";

export interface ShopifyAdminFetchOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

function ensureHttps(value: string): string {
  return value.startsWith("https://") ? value : `https://${value}`;
}

export function hasShopifyAdminConfig(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(env.SHOPIFY_STORE_DOMAIN && env.SHOPIFY_ADMIN_TOKEN);
}

export async function shopifyAdminFetch<T>(
  query: string,
  variables: Record<string, unknown>,
  options: ShopifyAdminFetchOptions = {},
): Promise<T> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const storeDomain = env.SHOPIFY_STORE_DOMAIN;
  const adminToken = env.SHOPIFY_ADMIN_TOKEN;
  const apiVersion = env.SHOPIFY_API_VERSION ?? DEFAULT_SHOPIFY_API_VERSION;

  if (!storeDomain || !adminToken) {
    throw new Error(
      "Missing Shopify Admin configuration. Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN.",
    );
  }

  const response = await fetchImpl(
    `${ensureHttps(storeDomain)}/admin/api/${apiVersion}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": adminToken,
      },
      body: JSON.stringify({ query, variables }),
    },
  );

  const payload = (await response.json()) as {
    data?: T;
    errors?: Array<{ message?: string }>;
  };

  if (!response.ok) {
    throw new Error(
      `Shopify Admin API failed with status ${response.status}: ${JSON.stringify(payload)}`,
    );
  }

  if (payload.errors && payload.errors.length > 0) {
    throw new Error(
      `Shopify Admin GraphQL error: ${payload.errors
        .map((error) => error.message ?? "unknown error")
        .join("; ")}`,
    );
  }

  if (!payload.data) {
    throw new Error("Shopify Admin GraphQL response did not include data.");
  }

  return payload.data;
}
