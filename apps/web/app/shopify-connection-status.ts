export const ShopifyConnectionStatus = {
  Ready: "ready",
  RequiresReauthorization: "requires_reauthorization",
} as const;

export type ShopifyConnectionStatus =
  (typeof ShopifyConnectionStatus)[keyof typeof ShopifyConnectionStatus];
