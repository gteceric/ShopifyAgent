import {
  FinancialStatus,
  FulfillmentStatus,
} from "../policy/refund-policy.types.js";

export interface ShopifyLineItem {
  sku: string;
  finalSale: boolean;
}

export interface ShopifyRiskFlags {
  fraudHold?: boolean;
  manualReview?: boolean;
  vipOverride?: boolean;
}

export interface ShopifyOrderRecord {
  id: string;
  name: string;
  createdAt: string;
  totalAmount: number;
  displayFinancialStatus?: FinancialStatus;
  displayFulfillmentStatus?: FulfillmentStatus;
  returnableFulfillmentsCount: number;
  isFullyRefunded: boolean;
  lineItems: ShopifyLineItem[];
  flags?: ShopifyRiskFlags;
}

export const MOCK_SHOPIFY_ORDERS: Record<string, ShopifyOrderRecord> = {
  "gid://shopify/Order/demo": {
    id: "gid://shopify/Order/demo",
    name: "#1001",
    createdAt: "2026-03-10T00:00:00.000Z",
    totalAmount: 48,
    displayFinancialStatus: FinancialStatus.Paid,
    displayFulfillmentStatus: FulfillmentStatus.Fulfilled,
    returnableFulfillmentsCount: 1,
    isFullyRefunded: false,
    lineItems: [{ sku: "DEMO-TEE", finalSale: false }],
  },
  "gid://shopify/Order/refunded": {
    id: "gid://shopify/Order/refunded",
    name: "#1002",
    createdAt: "2026-02-28T00:00:00.000Z",
    totalAmount: 24,
    displayFinancialStatus: FinancialStatus.Refunded,
    displayFulfillmentStatus: FulfillmentStatus.Fulfilled,
    returnableFulfillmentsCount: 0,
    isFullyRefunded: true,
    lineItems: [{ sku: "DEMO-MUG", finalSale: false }],
  },
};
