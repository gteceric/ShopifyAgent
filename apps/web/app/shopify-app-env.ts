import { readOptionalStringEnv } from "@shopify-agent/core";

const DEFAULT_SHOPIFY_API_VERSION = "2026-01";

// read from env first and fallback to injected value done by shopify app
function readFirstStringEnv(
  names: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  for (const name of names) {
    const value = readOptionalStringEnv(name, env);

    if (value) {
      return value;
    }
  }

  return null;
}

function readRequiredFirstStringEnv(
  names: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): string {
  const value = readFirstStringEnv(names, env);

  if (!value) {
    throw new Error(`${names.join(" or ")} is required.`);
  }

  return value;
}

export function readOptionalShopifyAppClientId(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return readFirstStringEnv(["SHOPIFY_APP_CLIENT_ID", "SHOPIFY_API_KEY"], env);
}

export function readShopifyAppClientId(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return readRequiredFirstStringEnv(
    ["SHOPIFY_APP_CLIENT_ID", "SHOPIFY_API_KEY"],
    env,
  );
}

export function readShopifyAppClientSecret(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return readRequiredFirstStringEnv(
    ["SHOPIFY_APP_CLIENT_SECRET", "SHOPIFY_API_SECRET"],
    env,
  );
}

export function readShopifyAppUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return readRequiredFirstStringEnv(
    ["SHOPIFY_APP_URL", "APP_URL", "HOST"],
    env,
  );
}

export function readShopifyApiVersion(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (
    readFirstStringEnv(["SHOPIFY_API_VERSION"], env) ??
    DEFAULT_SHOPIFY_API_VERSION
  );
}

export function buildShopifyAppRuntimeEnv(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return {
    ...env,
    SHOPIFY_APP_CLIENT_ID: readShopifyAppClientId(env),
    SHOPIFY_APP_CLIENT_SECRET: readShopifyAppClientSecret(env),
    SHOPIFY_APP_URL: readShopifyAppUrl(env),
    SHOPIFY_API_VERSION: readShopifyApiVersion(env),
  };
}
