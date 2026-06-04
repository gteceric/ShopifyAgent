import { createHmac, timingSafeEqual } from "node:crypto";

export type ShopifyWebhookHeaders = Readonly<
  Record<string, string | string[] | undefined>
>;

export const SHOPIFY_WEBHOOK_HMAC_HEADER = "x-shopify-hmac-sha256";

export function readShopifyWebhookHeader(
  headers: ShopifyWebhookHeaders,
  name: string,
): string | undefined {
  const value = headers[name.toLowerCase()];

  if (Array.isArray(value)) {
    return undefined;
  }

  const normalizedValue = value?.trim();

  return normalizedValue ? normalizedValue : undefined;
}

export function verifyShopifyWebhookHmac(
  rawBody: Buffer,
  providedHmac: string | undefined,
  clientSecret: string,
): boolean {
  if (!providedHmac || !clientSecret) {
    return false;
  }

  const expectedHmac = createHmac("sha256", clientSecret)
    .update(rawBody)
    .digest();
  const providedHmacBuffer = Buffer.from(providedHmac, "base64");

  return (
    providedHmacBuffer.length === expectedHmac.length &&
    timingSafeEqual(providedHmacBuffer, expectedHmac)
  );
}
