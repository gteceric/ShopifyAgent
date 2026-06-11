import {
  fetchWithTimeout,
  normalizeRequiredString,
  requireExternalPositiveInteger,
  requireExternalString,
} from "@shopify-agent/core";

const SHOPIFY_REFRESH_TOKEN_GRANT_TYPE = "refresh_token";

export interface RefreshShopifyOfflineTokenInput {
  shopDomain: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface RefreshedShopifyOfflineToken {
  accessToken: string;
  accessTokenExpiresInSeconds: number;
  refreshToken: string;
  refreshTokenExpiresInSeconds: number;
  grantedScopes: string[];
}

interface ShopifyOfflineTokenRefreshResponse {
  access_token?: unknown;
  error?: unknown;
  error_description?: unknown;
  expires_in?: unknown;
  refresh_token?: unknown;
  refresh_token_expires_in?: unknown;
  scope?: unknown;
}

const SHOPIFY_PERMANENT_REFRESH_TOKEN_ERROR_CODE = "invalid_grant";

export class ShopifyOfflineTokenRefreshRejectedError extends Error {
  readonly errorCode: string;
  readonly status: number;

  constructor(status: number, errorCode: string, errorDescription: string | null) {
    const description = errorDescription ? `: ${errorDescription}` : "";

    super(
      `Shopify rejected the offline refresh token with ${errorCode}${description}`,
    );
    this.name = "ShopifyOfflineTokenRefreshRejectedError";
    this.errorCode = errorCode;
    this.status = status;
  }
}

export function isShopifyOfflineTokenRefreshRejectedError(
  error: unknown,
): error is ShopifyOfflineTokenRefreshRejectedError {
  return error instanceof ShopifyOfflineTokenRefreshRejectedError;
}

function missingRefreshResponseValueError(name: string): Error {
  return new Error(`Shopify token refresh response did not include ${name}.`);
}

function invalidRefreshResponseValueError(name: string): Error {
  return new Error(
    `Shopify token refresh response did not include a valid ${name}.`,
  );
}

function readGrantedScopes(value: unknown): string[] {
  if (typeof value !== "string") {
    throw new Error("Shopify token refresh response did not include scope.");
  }

  return value
    .split(",")
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
}

export async function refreshShopifyOfflineToken(
  input: RefreshShopifyOfflineTokenInput,
  fetchImpl: typeof fetch,
  timeoutMs?: number,
): Promise<RefreshedShopifyOfflineToken> {
  const shopDomain = normalizeRequiredString(input.shopDomain, "shopDomain");
  const body = new URLSearchParams({
    client_id: normalizeRequiredString(input.clientId, "clientId"),
    client_secret: normalizeRequiredString(input.clientSecret, "clientSecret"),
    grant_type: SHOPIFY_REFRESH_TOKEN_GRANT_TYPE,
    refresh_token: normalizeRequiredString(input.refreshToken, "refreshToken"),
  });
  const tokenRefreshRequest: RequestInit = {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  };
  const response = await fetchWithTimeout(
    `https://${shopDomain}/admin/oauth/access_token`,
    tokenRefreshRequest,
    {
      fetchImpl,
      timeoutMs,
    },
  );
  const payload = (await response.json()) as ShopifyOfflineTokenRefreshResponse;

  if (!response.ok) {
    const errorCode =
      typeof payload.error === "string" ? payload.error.trim() : "";
    const errorDescription =
      typeof payload.error_description === "string"
        ? payload.error_description.trim() || null
        : null;

    if (errorCode === SHOPIFY_PERMANENT_REFRESH_TOKEN_ERROR_CODE) {
      throw new ShopifyOfflineTokenRefreshRejectedError(
        response.status,
        errorCode,
        errorDescription,
      );
    }

    throw new Error(
      `Shopify offline token refresh failed with status ${response.status}: ${JSON.stringify(payload)}`,
    );
  }

  return {
    accessToken: requireExternalString(payload.access_token, () =>
      missingRefreshResponseValueError("access_token"),
    ),
    accessTokenExpiresInSeconds: requireExternalPositiveInteger(
      payload.expires_in,
      () => invalidRefreshResponseValueError("expires_in"),
    ),
    refreshToken: requireExternalString(payload.refresh_token, () =>
      missingRefreshResponseValueError("refresh_token"),
    ),
    refreshTokenExpiresInSeconds: requireExternalPositiveInteger(
      payload.refresh_token_expires_in,
      () => invalidRefreshResponseValueError("refresh_token_expires_in"),
    ),
    grantedScopes: readGrantedScopes(payload.scope),
  };
}
