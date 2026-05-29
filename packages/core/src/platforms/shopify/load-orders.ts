import {
  FinancialStatus,
  FulfillmentStatus,
} from "../../domain/refund-policy.types.js";
import { hasPendingOrderRefundTransaction } from "../../domain/refund-processing-status.js";
import { MOCK_SHOPIFY_ORDERS } from "./mock-shopify-orders.js";
import type { ShopifyOrderRecord } from "./mock-shopify-orders.js";
import {
  hasShopifyAdminConfig,
  shopifyAdminFetch,
} from "./shopify-admin.js";
import { SHOPIFY_ORDERS_LIST_QUERY } from "./shopify-queries.js";

export interface ShopifyOrderSummary {
  id: string;
  name: string;
  customerName: string;
  createdAt: string;
  totalAmount: number;
  financialStatus: FinancialStatus;
  fulfillmentStatus: FulfillmentStatus;
}

export interface LoadShopifyOrdersInput {
  limit?: number;
}

export interface LoadShopifyOrdersDependencies {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

interface ShopifyOrdersListResponse {
  orders: {
    nodes: Array<{
      id: string;
      name: string;
      createdAt: string;
      totalPriceSet?: {
        shopMoney?: {
          amount?: string | null;
        } | null;
      } | null;
      displayFinancialStatus?: string | null;
      displayFulfillmentStatus?: string | null;
      transactions?: Array<{
        kind?: string | null;
        status?: string | null;
      }> | null;
      customer?: {
        displayName?: string | null;
      } | null;
    }>;
  };
}

const DEFAULT_ORDERS_LIMIT = 25;

function shouldUseRealShopify(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.USE_REAL_SHOPIFY === "true";
}

function mapFinancialStatus(status?: string | null): FinancialStatus {
  switch (status) {
    case "PAID":
      return FinancialStatus.Paid;
    case "PARTIALLY_PAID":
      return FinancialStatus.PartiallyPaid;
    case "PARTIALLY_REFUNDED":
      return FinancialStatus.PartiallyRefunded;
    case "REFUNDED":
      return FinancialStatus.Refunded;
    case "PENDING":
      return FinancialStatus.PaymentPending;
    case "VOIDED":
      return FinancialStatus.Voided;
    default:
      return FinancialStatus.Unknown;
  }
}

function normalizeFinancialStatus(
  order: ShopifyOrdersListResponse["orders"]["nodes"][number],
): FinancialStatus {
  if (hasPendingOrderRefundTransaction(order.transactions)) {
    return FinancialStatus.RefundPending;
  }

  return mapFinancialStatus(order.displayFinancialStatus);
}

function mapFulfillmentStatus(status?: string | null): FulfillmentStatus {
  switch (status) {
    case "UNFULFILLED":
      return FulfillmentStatus.Unfulfilled;
    case "PARTIALLY_FULFILLED":
      return FulfillmentStatus.Partial;
    case "FULFILLED":
      return FulfillmentStatus.Fulfilled;
    case "RESTOCKED":
      return FulfillmentStatus.Restocked;
    default:
      return FulfillmentStatus.Unknown;
  }
}

function mapMockOrderToSummary(order: ShopifyOrderRecord): ShopifyOrderSummary {
  return {
    id: order.id,
    name: order.name,
    customerName: order.customerName,
    createdAt: order.createdAt,
    totalAmount: order.totalAmount,
    financialStatus: order.displayFinancialStatus ?? FinancialStatus.Unknown,
    fulfillmentStatus:
      order.displayFulfillmentStatus ?? FulfillmentStatus.Unknown,
  };
}

export function mapAdminOrderToShopifyOrderSummary(
  order: ShopifyOrdersListResponse["orders"]["nodes"][number],
): ShopifyOrderSummary {
  return {
    id: order.id,
    name: order.name,
    customerName: order.customer?.displayName?.trim() || "Unknown customer",
    createdAt: order.createdAt,
    totalAmount: Number(order.totalPriceSet?.shopMoney?.amount ?? "0"),
    financialStatus: normalizeFinancialStatus(order),
    fulfillmentStatus: mapFulfillmentStatus(order.displayFulfillmentStatus),
  };
}

async function loadOrdersFromShopify(
  input: LoadShopifyOrdersInput,
  dependencies: LoadShopifyOrdersDependencies,
): Promise<ShopifyOrderSummary[]> {
  const response = await shopifyAdminFetch<ShopifyOrdersListResponse>(
    SHOPIFY_ORDERS_LIST_QUERY,
    { first: input.limit ?? DEFAULT_ORDERS_LIMIT },
    {
      env: dependencies.env,
      fetchImpl: dependencies.fetchImpl,
    },
  );

  return response.orders.nodes.map(mapAdminOrderToShopifyOrderSummary);
}

export async function loadOrders(
  input: LoadShopifyOrdersInput = {},
  dependencies: LoadShopifyOrdersDependencies = {},
): Promise<ShopifyOrderSummary[]> {
  if (shouldUseRealShopify(dependencies.env)) {
    if (!hasShopifyAdminConfig(dependencies.env)) {
      throw new Error(
        "USE_REAL_SHOPIFY=true requires SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN.",
      );
    }

    return loadOrdersFromShopify(input, dependencies);
  }

  const limit = input.limit ?? DEFAULT_ORDERS_LIMIT;

  return Object.values(MOCK_SHOPIFY_ORDERS)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit)
    .map(mapMockOrderToSummary);
}
