import {
  FinancialStatus,
  FulfillmentStatus,
} from "../../domain/refund-policy.types.js";
import type {
  RefundContext,
  RefundContextLineItem,
} from "../../domain/refund-policy.types.js";
import type {
  RefundContextInput,
  RefundContextPlatformAdapter,
} from "../../application/refund-context-adapter.js";
import { MOCK_SHOPIFY_ORDERS } from "./mock-shopify-orders.js";
import type { ShopifyOrderRecord } from "./mock-shopify-orders.js";
import {
  REFUND_ORDER_CONTEXT_QUERY,
  REFUND_RETURNABLE_FULFILLMENTS_QUERY,
} from "./shopify-queries.js";
import { hasShopifyAdminConfig, shopifyAdminFetch } from "./shopify-admin.js";

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
  title?: string | null;
  currentQuantity: number;
  product?: {
    category?: {
      fullName?: string | null;
    } | null;
  } | null;
  customAttributes: Array<{
    key: string;
    value: string;
  }>;
}

interface ShopifyRefundOrderContextResponse {
  order: {
    id: string;
    name: string;
    tags?: string[] | null;
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
            lineItem?: {
              id: string;
            } | null;
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

function normalizeStringArray(
  values: Array<string | undefined | null>,
): string[] {
  return [
    ...new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

function mapMockLineItemsToRefundContextLineItems(
  order: ShopifyOrderRecord,
): RefundContextLineItem[] {
  return order.lineItems.map((lineItem, index) => ({
    lineItemId: `${order.id}/LineItem/${index + 1}`,
    title: lineItem.sku,
    returnableQuantity: 1,
    category: lineItem.category,
    fulfillmentStatus:
      order.displayFulfillmentStatus ?? FulfillmentStatus.Unknown,
    hasReturnableFulfillment: order.returnableFulfillmentsCount > 0,
    alreadyRefunded: order.isFullyRefunded,
    finalSale: lineItem.finalSale,
  }));
}

function mapShopifyMockOrderToRefundContext(
  order: ShopifyOrderRecord,
  now: Date,
): RefundContext {
  return {
    order: {
      id: order.id,
      name: order.name,
      createdAt: order.createdAt,
      ageDays: daysBetween(order.createdAt, now),
      totalAmount: order.totalAmount,
      financialStatus: order.displayFinancialStatus ?? FinancialStatus.Unknown,
      tags: normalizeStringArray(order.tags ?? []),
      flags: {
        fraudHold: order.flags?.fraudHold ?? false,
        manualReview: order.flags?.manualReview ?? false,
        vipOverride: order.flags?.vipOverride ?? false,
      },
    },
    lineItems: mapMockLineItemsToRefundContextLineItems(order),
  };
}

function collectReturnableLineItems(
  returnable: ShopifyReturnableFulfillmentsResponse,
): Map<string, { fulfillmentLineItemId: string; returnableQuantity: number }> {
  const returnableLineItems = new Map<
    string,
    { fulfillmentLineItemId: string; returnableQuantity: number }
  >();

  for (const fulfillment of returnable.returnableFulfillments.nodes) {
    for (const lineItem of fulfillment.returnableFulfillmentLineItems.nodes) {
      const lineItemId = lineItem.fulfillmentLineItem?.lineItem?.id;
      const fulfillmentLineItemId = lineItem.fulfillmentLineItem?.id;

      if (!lineItemId || !fulfillmentLineItemId || lineItem.quantity <= 0) {
        continue;
      }

      returnableLineItems.set(lineItemId, {
        fulfillmentLineItemId,
        returnableQuantity: lineItem.quantity,
      });
    }
  }

  return returnableLineItems;
}

function mapAdminLineItemsToRefundContextLineItems(
  order: NonNullable<ShopifyRefundOrderContextResponse["order"]>,
  returnable: ShopifyReturnableFulfillmentsResponse,
  financialStatus: FinancialStatus,
): RefundContextLineItem[] {
  const returnableLineItems = collectReturnableLineItems(returnable);
  const orderFulfillmentStatus = mapFulfillmentStatus(
    order.displayFulfillmentStatus,
  );

  return order.lineItems.nodes.map((lineItem) => {
    const returnableLineItem = returnableLineItems.get(lineItem.id);

    return {
      lineItemId: lineItem.id,
      ...(returnableLineItem
        ? { fulfillmentLineItemId: returnableLineItem.fulfillmentLineItemId }
        : {}),
      title: lineItem.title ?? undefined,
      returnableQuantity: returnableLineItem?.returnableQuantity ?? 0,
      category: lineItem.product?.category?.fullName ?? undefined,
      fulfillmentStatus: orderFulfillmentStatus,
      hasReturnableFulfillment: returnableLineItem !== undefined,
      alreadyRefunded:
        financialStatus === FinancialStatus.Refunded ||
        lineItem.currentQuantity <= 0,
      finalSale: isFinalSaleLineItem(lineItem),
    };
  });
}

// Map Shopify order context into the platform-neutral refund context.
export function mapAdminOrderToRefundContext(
  order: NonNullable<ShopifyRefundOrderContextResponse["order"]>,
  returnable: ShopifyReturnableFulfillmentsResponse,
  now: Date,
): RefundContext {
  const financialStatus = mapFinancialStatus(order.displayFinancialStatus);

  return {
    order: {
      id: order.id,
      name: order.name,
      createdAt: order.createdAt,
      ageDays: daysBetween(order.createdAt, now),
      totalAmount: Number(order.totalPriceSet?.shopMoney?.amount ?? "0"),
      financialStatus,
      tags: normalizeStringArray(order.tags ?? []),
      flags: {
        fraudHold: parseBooleanFlag(order.fraudHoldFlag?.value),
        manualReview: parseBooleanFlag(order.manualReviewFlag?.value),
        vipOverride: parseBooleanFlag(order.vipOverrideFlag?.value),
      },
    },
    lineItems: mapAdminLineItemsToRefundContextLineItems(
      order,
      returnable,
      financialStatus,
    ),
  };
}

async function loadRefundContextFromShopify(
  input: RefundContextInput,
  deps: LoadShopifyRefundContextDeps,
): Promise<RefundContext> {
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

  return mapAdminOrderToRefundContext(
    orderResponse.order,
    returnableResponse,
    deps.now ?? new Date(),
  );
}

async function loadRefundContextFromMockShopify(
  input: RefundContextInput,
  deps: LoadShopifyRefundContextDeps = {},
): Promise<RefundContext> {
  const order = MOCK_SHOPIFY_ORDERS[input.orderId];

  if (!order) {
    throw new Error(
      `No mock Shopify order exists for ${input.orderId}. ` +
        "Set USE_REAL_SHOPIFY=true with Shopify Admin env vars to fetch a real order instead.",
    );
  }

  return mapShopifyMockOrderToRefundContext(order, deps.now ?? new Date());
}

export function createMockShopifyRefundContextAdapter(
  deps: LoadShopifyRefundContextDeps = {},
): RefundContextPlatformAdapter {
  return {
    platform: "shopify-mock",
    loadRefundContext(input) {
      return loadRefundContextFromMockShopify(input, deps);
    },
  };
}

export function createShopifyAdminRefundContextAdapter(
  deps: LoadShopifyRefundContextDeps = {},
): RefundContextPlatformAdapter {
  return {
    platform: "shopify-admin",
    loadRefundContext(input) {
      if (!hasShopifyAdminConfig(deps.env)) {
        throw new Error(
          "USE_REAL_SHOPIFY=true requires SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN.",
        );
      }

      return loadRefundContextFromShopify(input, deps);
    },
  };
}

export function createRefundContextAdapter(
  deps: LoadShopifyRefundContextDeps = {},
): RefundContextPlatformAdapter {
  return shouldUseRealShopify(deps.env)
    ? createShopifyAdminRefundContextAdapter(deps)
    : createMockShopifyRefundContextAdapter(deps);
}
