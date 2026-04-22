import {
  FinancialStatus,
  FulfillmentStatus,
} from "../../domain/refund-policy.types.js";

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
  customerName: string;
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
  "gid://shopify/Order/6275299147889": {
    id: "gid://shopify/Order/6275299147889",
    name: "#4881",
    customerName: "Maya Chen",
    createdAt: "2025-11-14T00:00:00.000Z",
    totalAmount: 128,
    displayFinancialStatus: FinancialStatus.Paid,
    displayFulfillmentStatus: FulfillmentStatus.Fulfilled,
    returnableFulfillmentsCount: 1,
    isFullyRefunded: false,
    lineItems: [{ sku: "ARCHIVE-JACKET", finalSale: false }],
  },
  "gid://shopify/Order/6261109358705": {
    id: "gid://shopify/Order/6261109358705",
    name: "#4867",
    customerName: "Elliot Park",
    createdAt: "2025-11-03T00:00:00.000Z",
    totalAmount: 36.99,
    displayFinancialStatus: FinancialStatus.Paid,
    displayFulfillmentStatus: FulfillmentStatus.Unfulfilled,
    returnableFulfillmentsCount: 0,
    isFullyRefunded: false,
    lineItems: [{ sku: "LATE-CANCEL", finalSale: false }],
  },
  "gid://shopify/Order/1001": {
    id: "gid://shopify/Order/1001",
    name: "#1001",
    customerName: "Jordan Rivera",
    createdAt: "2026-03-10T00:00:00.000Z",
    totalAmount: 48,
    displayFinancialStatus: FinancialStatus.Paid,
    displayFulfillmentStatus: FulfillmentStatus.Fulfilled,
    returnableFulfillmentsCount: 1,
    isFullyRefunded: false,
    lineItems: [{ sku: "DEMO-TEE", finalSale: false }],
  },
  "gid://shopify/Order/1044": {
    id: "gid://shopify/Order/1044",
    name: "#1044",
    customerName: "Noah Patel",
    createdAt: "2026-04-02T00:00:00.000Z",
    totalAmount: 785,
    displayFinancialStatus: FinancialStatus.Paid,
    displayFulfillmentStatus: FulfillmentStatus.Fulfilled,
    returnableFulfillmentsCount: 1,
    isFullyRefunded: false,
    lineItems: [{ sku: "HIGH-VALUE", finalSale: false }],
  },
  "gid://shopify/Order/1089": {
    id: "gid://shopify/Order/1089",
    name: "#1089",
    customerName: "Sophia Nguyen",
    createdAt: "2026-04-07T00:00:00.000Z",
    totalAmount: 62.5,
    displayFinancialStatus: FinancialStatus.Paid,
    displayFulfillmentStatus: FulfillmentStatus.Fulfilled,
    returnableFulfillmentsCount: 1,
    isFullyRefunded: false,
    lineItems: [{ sku: "SPRING-MUG", finalSale: false }],
  },
  "gid://shopify/Order/1127": {
    id: "gid://shopify/Order/1127",
    name: "#1127",
    customerName: "Liam Brooks",
    createdAt: "2026-02-19T00:00:00.000Z",
    totalAmount: 214.3,
    displayFinancialStatus: FinancialStatus.Paid,
    displayFulfillmentStatus: FulfillmentStatus.Fulfilled,
    returnableFulfillmentsCount: 1,
    isFullyRefunded: false,
    lineItems: [{ sku: "WINTER-SET", finalSale: false }],
  },
  "gid://shopify/Order/1182": {
    id: "gid://shopify/Order/1182",
    name: "#1182",
    customerName: "Ava Martinez",
    createdAt: "2026-03-28T00:00:00.000Z",
    totalAmount: 512,
    displayFinancialStatus: FinancialStatus.Paid,
    displayFulfillmentStatus: FulfillmentStatus.Fulfilled,
    returnableFulfillmentsCount: 1,
    isFullyRefunded: false,
    lineItems: [{ sku: "PREMIUM-BUNDLE", finalSale: false }],
  },
  "gid://shopify/Order/1215": {
    id: "gid://shopify/Order/1215",
    name: "#1215",
    customerName: "Ethan Wong",
    createdAt: "2026-01-30T00:00:00.000Z",
    totalAmount: 89,
    displayFinancialStatus: FinancialStatus.Paid,
    displayFulfillmentStatus: FulfillmentStatus.Unfulfilled,
    returnableFulfillmentsCount: 0,
    isFullyRefunded: false,
    lineItems: [{ sku: "OPS-HOLD", finalSale: false }],
  },
  "gid://shopify/Order/1279": {
    id: "gid://shopify/Order/1279",
    name: "#1279",
    customerName: "Grace Kim",
    createdAt: "2026-04-11T00:00:00.000Z",
    totalAmount: 24,
    displayFinancialStatus: FinancialStatus.Paid,
    displayFulfillmentStatus: FulfillmentStatus.Unfulfilled,
    returnableFulfillmentsCount: 0,
    isFullyRefunded: false,
    lineItems: [{ sku: "QUICK-CANCEL", finalSale: false }],
  },
  "gid://shopify/Order/1002": {
    id: "gid://shopify/Order/1002",
    name: "#1002",
    customerName: "Demo Customer",
    createdAt: "2026-02-28T00:00:00.000Z",
    totalAmount: 24,
    displayFinancialStatus: FinancialStatus.Refunded,
    displayFulfillmentStatus: FulfillmentStatus.Fulfilled,
    returnableFulfillmentsCount: 0,
    isFullyRefunded: true,
    lineItems: [{ sku: "DEMO-MUG", finalSale: false }],
  },
};
