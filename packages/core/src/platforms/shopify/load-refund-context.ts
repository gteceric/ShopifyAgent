import {
  FinancialStatus,
  FulfillmentStatus,
} from "../../domain/refund-policy.types.js";
import type { RefundPolicyInput } from "../../domain/refund-policy.types.js";
import type {
  LoadRefundContextInput,
  RefundContextPlatformAdapter,
} from "../../application/refund-context-adapter.js";
import { MOCK_SHOPIFY_ORDERS } from "./mock-shopify-orders.js";
import type { ShopifyOrderRecord } from "./mock-shopify-orders.js";
import {
  hasShopifyAdminConfig,
  REFUND_ORDER_CONTEXT_QUERY,
  REFUND_RETURNABLE_FULFILLMENTS_QUERY,
  shopifyAdminFetch,
} from "./shopify-admin.js";

export interface LoadShopifyRefundContextDeps {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  now?: Date;
}

function shouldUseRealShopify(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.USE_REAL_SHOPIFY === "true";
}

interface ShopifyMetafieldValue {
  value: string;
}

interface ShopifyAdminLineItem {
  id: string;
  currentQuantity: number;
  customAttributes: Array<{
    key: string;
    value: string;
  }>;
}

interface ShopifyRefundOrderContextResponse {
  order: {
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
    lineItems: {
      nodes: ShopifyAdminLineItem[];
    };
    fraudHoldFlag?: ShopifyMetafieldValue | null;
    manualReviewFlag?: ShopifyMetafieldValue | null;
    vipOverrideFlag?: ShopifyMetafieldValue | null;
  } | null;
}

interface ShopifyReturnableFulfillmentsResponse {
  returnableFulfillments: {
    nodes: Array<{
      id: string;
      returnableFulfillmentLineItems: {
        nodes: Array<{
          quantity: number;
          fulfillmentLineItem: {
            id: string;
          } | null;
        }>;
      };
    }>;
  };
}

function daysBetween(startIso: string, end: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;

  return Math.max(
    0,
    Math.floor((end.getTime() - new Date(startIso).getTime()) / msPerDay),
  );
}

function mapFinancialStatus(status?: string | null) {
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
      return FinancialStatus.Pending;
    case "VOIDED":
      return FinancialStatus.Voided;
    default:
      return FinancialStatus.Unknown;
  }
}

function mapFulfillmentStatus(status?: string | null) {
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

function parseBooleanFlag(value?: string | null): boolean {
  if (!value) {
    return false;
  }

  return ["true", "1", "yes"].includes(value.trim().toLowerCase());
}

function isFinalSaleLineItem(lineItem: ShopifyAdminLineItem): boolean {
  return lineItem.customAttributes.some(({ key, value }) => {
    const normalizedKey = key.trim().toLowerCase();
    const normalizedValue = value.trim().toLowerCase();

    return (
      ["final_sale", "is_final_sale", "finalsale", "isfinalsale"].includes(
        normalizedKey,
      ) && ["true", "1", "yes"].includes(normalizedValue)
    );
  });
}

function mapShopifyOrderToRefundPolicyInput(
  order: ShopifyOrderRecord,
  now: Date,
): RefundPolicyInput {
  return {
    orderId: order.id,
    orderName: order.name,
    orderCreatedAt: order.createdAt,
    orderAgeDays: daysBetween(order.createdAt, now),
    orderTotalAmount: order.totalAmount,
    financialStatus: order.displayFinancialStatus ?? FinancialStatus.Unknown,
    fulfillmentStatus:
      order.displayFulfillmentStatus ?? FulfillmentStatus.Unknown,
    hasReturnableFulfillments: order.returnableFulfillmentsCount > 0,
    alreadyFullyRefunded: order.isFullyRefunded,
    allItemsFinalSale:
      order.lineItems.length > 0 &&
      order.lineItems.every((lineItem) => lineItem.finalSale),
    flags: {
      fraudHold: order.flags?.fraudHold ?? false,
      manualReview: order.flags?.manualReview ?? false,
      vipOverride: order.flags?.vipOverride ?? false,
    },
  };
}

// Map Shopify order context into the platform-neutral refund policy input.
export function mapAdminOrderToRefundPolicyInput(
  order: NonNullable<ShopifyRefundOrderContextResponse["order"]>,
  returnable: ShopifyReturnableFulfillmentsResponse,
  now: Date,
): RefundPolicyInput {
  const financialStatus = mapFinancialStatus(order.displayFinancialStatus);

  return {
    orderId: order.id,
    orderName: order.name,
    orderCreatedAt: order.createdAt,
    orderAgeDays: daysBetween(order.createdAt, now),
    orderTotalAmount: Number(order.totalPriceSet?.shopMoney?.amount ?? "0"),
    financialStatus,
    fulfillmentStatus: mapFulfillmentStatus(order.displayFulfillmentStatus),
    hasReturnableFulfillments: returnable.returnableFulfillments.nodes.some(
      (fulfillment) =>
        fulfillment.returnableFulfillmentLineItems.nodes.some(
          (lineItem) => lineItem.quantity > 0,
        ),
    ),
    alreadyFullyRefunded: financialStatus === FinancialStatus.Refunded,
    allItemsFinalSale:
      order.lineItems.nodes.length > 0 &&
      order.lineItems.nodes.every(isFinalSaleLineItem),
    flags: {
      fraudHold: parseBooleanFlag(order.fraudHoldFlag?.value),
      manualReview: parseBooleanFlag(order.manualReviewFlag?.value),
      vipOverride: parseBooleanFlag(order.vipOverrideFlag?.value),
    },
  };
}

async function loadRefundContextFromShopify(
  input: LoadRefundContextInput,
  deps: LoadShopifyRefundContextDeps,
): Promise<RefundPolicyInput> {
  // The policy engine needs both the order record and Shopify's separate
  // returnable-fulfillments view to decide whether a refund path is actually open.
  const orderResponse =
    await shopifyAdminFetch<ShopifyRefundOrderContextResponse>(
      REFUND_ORDER_CONTEXT_QUERY,
      { id: input.orderId },
      {
        env: deps.env,
        fetchImpl: deps.fetchImpl,
      },
    );

  if (!orderResponse.order) {
    throw new Error(`No Shopify order exists for ${input.orderId}.`);
  }

  const returnableResponse =
    await shopifyAdminFetch<ShopifyReturnableFulfillmentsResponse>(
      REFUND_RETURNABLE_FULFILLMENTS_QUERY,
      { orderId: input.orderId },
      {
        env: deps.env,
        fetchImpl: deps.fetchImpl,
      },
    );

  return mapAdminOrderToRefundPolicyInput(
    orderResponse.order,
    returnableResponse,
    deps.now ?? new Date(),
  );
}

// take orderId
// fetch/load the order context from Shopify or mock data
export async function loadRefundContext(
  input: LoadRefundContextInput,
  deps: LoadShopifyRefundContextDeps = {},
): Promise<RefundPolicyInput> {
  if (shouldUseRealShopify(deps.env)) {
    if (!hasShopifyAdminConfig(deps.env)) {
      throw new Error(
        "USE_REAL_SHOPIFY=true requires SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN.",
      );
    }

    return loadRefundContextFromShopify(input, deps);
  }

  // In mock mode, this loader still returns the same platform-neutral
  // RefundPolicyInput shape that the domain policy evaluator consumes.
  const order = MOCK_SHOPIFY_ORDERS[input.orderId];

  if (!order) {
    throw new Error(
      `No mock Shopify order exists for ${input.orderId}. ` +
        "Set USE_REAL_SHOPIFY=true with Shopify Admin env vars to fetch a real order instead.",
    );
  }

  return mapShopifyOrderToRefundPolicyInput(order, deps.now ?? new Date());
}

export function createShopifyRefundContextAdapter(
  deps: LoadShopifyRefundContextDeps = {},
): RefundContextPlatformAdapter {
  return {
    platform: "shopify",
    loadRefundContext(input) {
      return loadRefundContext(input, deps);
    },
  };
}
