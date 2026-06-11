import { normalizeRequiredString } from "../../shared/normalize-value.js";
import { fetchWithTimeout } from "../../shared/fetch-with-timeout.js";

const DEFAULT_SHOPIFY_API_VERSION = "2026-01";

export interface ShopifyAdminClient {
  fetch<T>(query: string, variables: Record<string, unknown>): Promise<T>;
}

export interface CreateShopifyAdminClientOptions {
  shopDomain: string;
  accessToken: string;
  apiVersion?: string;
  fetchImpl: typeof fetch;
  timeoutMs?: number;
}

function ensureHttps(value: string): string {
  return value.startsWith("https://") ? value : `https://${value}`;
}

export function createShopifyAdminClient(
  options: CreateShopifyAdminClientOptions,
): ShopifyAdminClient {
  const shopDomain = normalizeRequiredString(options.shopDomain, "shopDomain");
  const accessToken = normalizeRequiredString(
    options.accessToken,
    "accessToken",
  );
  const apiVersion = options.apiVersion?.trim() || undefined;
  const timeoutMs = options.timeoutMs;

  return {
    fetch<T>(query: string, variables: Record<string, unknown>): Promise<T> {
      return fetchShopifyAdminHelper(query, variables, {
        shopDomain,
        accessToken,
        apiVersion,
        fetchImpl: options.fetchImpl,
        timeoutMs,
      });
    },
  };
}

async function fetchShopifyAdminHelper<T>(
  query: string,
  variables: Record<string, unknown>,
  options: CreateShopifyAdminClientOptions,
): Promise<T> {
  const apiVersion = options.apiVersion ?? DEFAULT_SHOPIFY_API_VERSION;
  const shopifyAdminRequest: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": options.accessToken,
    },
    body: JSON.stringify({ query, variables }),
  };
  const response = await fetchWithTimeout(
    `${ensureHttps(options.shopDomain)}/admin/api/${apiVersion}/graphql.json`,
    shopifyAdminRequest,
    {
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs,
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
