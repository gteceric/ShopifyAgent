import "@shopify/shopify-api/adapters/node";
import { ApiVersion, LogSeverity, shopifyApi } from "@shopify/shopify-api";
import {
  fetchWithTimeout,
  normalizeRequiredString,
  requireExternalPositiveInteger,
  requireExternalString,
  type FetchWithTimeoutOptions,
} from "@shopify-agent/core";

const SHOPIFY_TOKEN_EXCHANGE_GRANT_TYPE =
  "urn:ietf:params:oauth:grant-type:token-exchange";
const SHOPIFY_ID_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:id_token";
const SHOPIFY_OFFLINE_ACCESS_TOKEN_TYPE =
  "urn:shopify:params:oauth:token-type:offline-access-token";

interface ShopifyOfflineTokenExchangeResponse {
  access_token?: unknown;
  expires_in?: unknown;
  refresh_token?: unknown;
  refresh_token_expires_in?: unknown;
  scope?: unknown;
}

export interface ExchangeShopifySessionTokenInput {
  sessionToken: string;
}

export interface ExchangeShopifySessionTokenOptions {
  appClientId: string;
  appClientSecret: string;
  appUrl: string;
  fetchImpl: typeof fetch;
  nowFn: () => Date;
  timeoutMs?: number;
}

export interface ShopifyOfflineCredentials {
  shopDomain: string;
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  grantedScopes: string[];
}

function readAppUrl(value: string): URL {
  const appUrl = new URL(normalizeRequiredString(value, "appUrl"));

  if (appUrl.protocol !== "https:" && appUrl.protocol !== "http:") {
    throw new Error("appUrl must use HTTP or HTTPS.");
  }

  return appUrl;
}

function missingTokenExchangeResponseValueError(name: string): Error {
  return new Error(
    `Shopify offline token exchange response did not include ${name}.`,
  );
}

function invalidTokenExchangeResponseValueError(name: string): Error {
  return new Error(
    `Shopify offline token exchange response did not include a valid ${name}.`,
  );
}

function readGrantedScopes(value: unknown): string[] {
  const scope = requireExternalString(value, () =>
    missingTokenExchangeResponseValueError("scope"),
  );

  return scope
    .split(",")
    .map((grantedScope) => grantedScope.trim())
    .filter((grantedScope) => grantedScope.length > 0);
}

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1_000);
}

// Verify session token signature, expiration, and app audience
// Read and validate the merchant shop domain from the token
// Call Shopify:
//    POST https://merchant-shop.myshopify.com/admin/oauth/access_token
// Request an expiring offline access token
// Validate Shopify's response

export async function exchangeShopifySessionTokenForOfflineCredentials(
  input: ExchangeShopifySessionTokenInput,
  options: ExchangeShopifySessionTokenOptions,
): Promise<ShopifyOfflineCredentials> {
  const sessionToken = normalizeRequiredString(
    input.sessionToken,
    "sessionToken",
  );
  const appClientId = normalizeRequiredString(
    options.appClientId,
    "appClientId",
  );
  const appClientSecret = normalizeRequiredString(
    options.appClientSecret,
    "appClientSecret",
  );
  const appUrl = readAppUrl(options.appUrl);
  const shopify = shopifyApi({
    apiKey: appClientId,
    apiSecretKey: appClientSecret,
    hostName: appUrl.host,
    hostScheme: appUrl.protocol === "http:" ? "http" : "https",
    apiVersion: ApiVersion.April26,
    isEmbeddedApp: true,
    logger: {
      level: LogSeverity.Warning,
    },
  });
  const sessionTokenPayload =
    await shopify.session.decodeSessionToken(sessionToken);
  const sessionDestination = new URL(sessionTokenPayload.dest);

  if (sessionDestination.protocol !== "https:") {
    throw new Error("Shopify session token destination must use HTTPS.");
  }

  const shopDomain = normalizeRequiredString(
    shopify.utils.sanitizeShop(sessionDestination.hostname, true),
    "shopDomain",
  ).toLowerCase();
  const tokenExchangeHeaders: HeadersInit = {
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
  };
  const tokenExchangeBody = new URLSearchParams({
    client_id: appClientId,
    client_secret: appClientSecret,
    grant_type: SHOPIFY_TOKEN_EXCHANGE_GRANT_TYPE,
    subject_token: sessionToken,
    subject_token_type: SHOPIFY_ID_TOKEN_TYPE,
    requested_token_type: SHOPIFY_OFFLINE_ACCESS_TOKEN_TYPE,
    expiring: "1",
  });
  const tokenExchangeRequest: RequestInit = {
    method: "POST",
    headers: tokenExchangeHeaders,
    body: tokenExchangeBody,
  };
  const tokenExchangeRequestOptions: FetchWithTimeoutOptions = {
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
  };
  const response = await fetchWithTimeout(
    `https://${shopDomain}/admin/oauth/access_token`,
    tokenExchangeRequest,
    tokenExchangeRequestOptions,
  );

  // response.json() is asynchronous and returns a Promise
  // because the HTTP response body may still be streaming from the network.
  const payload =
    (await response.json()) as ShopifyOfflineTokenExchangeResponse;

  if (!response.ok) {
    throw new Error(
      `Shopify offline token exchange failed with status ${response.status}: ${JSON.stringify(payload)}`,
    );
  }

  // Requires runtime validation before use as ShopifyOfflineTokenExchangeResponse contains unknown type
  const accessTokenExpiresInSeconds = requireExternalPositiveInteger(
    payload.expires_in,
    () => invalidTokenExchangeResponseValueError("expires_in"),
  );
  const refreshTokenExpiresInSeconds = requireExternalPositiveInteger(
    payload.refresh_token_expires_in,
    () => invalidTokenExchangeResponseValueError("refresh_token_expires_in"),
  );
  const now = options.nowFn();

  return {
    shopDomain,
    accessToken: requireExternalString(payload.access_token, () =>
      missingTokenExchangeResponseValueError("access_token"),
    ),
    accessTokenExpiresAt: addSeconds(now, accessTokenExpiresInSeconds),
    refreshToken: requireExternalString(payload.refresh_token, () =>
      missingTokenExchangeResponseValueError("refresh_token"),
    ),
    refreshTokenExpiresAt: addSeconds(now, refreshTokenExpiresInSeconds),
    grantedScopes: readGrantedScopes(payload.scope),
  };
}
