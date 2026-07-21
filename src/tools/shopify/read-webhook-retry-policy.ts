import { readOptionalPositiveIntegerEnv } from "@shopify-agent/core";
import {
  DEFAULT_SHOPIFY_WEBHOOK_INITIAL_RETRY_DELAY_MS,
  DEFAULT_SHOPIFY_WEBHOOK_MAX_ATTEMPTS,
  DEFAULT_SHOPIFY_WEBHOOK_MAX_RETRY_DELAY_MS,
  type ShopifyWebhookRetryPolicy,
} from "../../platforms/shopify/webhooks/process-webhook-events.js";

export function readShopifyWebhookRetryPolicy(): ShopifyWebhookRetryPolicy {
  return {
    maxAttempts:
      readOptionalPositiveIntegerEnv("SHOPIFY_WEBHOOK_MAX_ATTEMPTS") ??
      DEFAULT_SHOPIFY_WEBHOOK_MAX_ATTEMPTS,
    initialDelayMs:
      readOptionalPositiveIntegerEnv(
        "SHOPIFY_WEBHOOK_INITIAL_RETRY_DELAY_MS",
      ) ?? DEFAULT_SHOPIFY_WEBHOOK_INITIAL_RETRY_DELAY_MS,
    maxDelayMs:
      readOptionalPositiveIntegerEnv("SHOPIFY_WEBHOOK_MAX_RETRY_DELAY_MS") ??
      DEFAULT_SHOPIFY_WEBHOOK_MAX_RETRY_DELAY_MS,
  };
}
