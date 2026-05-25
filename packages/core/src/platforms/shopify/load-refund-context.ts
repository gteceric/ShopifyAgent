import {
  FinancialStatus,
  FulfillmentStatus,
} from "../../domain/refund-policy.types.js";
import type {
  RefundContext,
  RefundContextLineItem,
  RefundLineItemOption,
  RefundMoney,
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

export interface LoadShopifyRefundContextDependencies {
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
  sku?: string | null;
  currentQuantity: number;
  originalUnitPriceSet?: ShopifyMoneySet | null;
  variant?: {
    title?: string | null;
    sku?: string | null;
    selectedOptions?: Array<{
      name?: string | null;
      value?: string | null;
    }> | null;
    image?: ShopifyImage | null;
  } | null;
  product?: {
    category?: {
      fullName?: string | null;
    } | null;
    featuredMedia?: {
      preview?: {
        image?: ShopifyImage | null;
      } | null;
    } | null;
  } | null;
  customAttributes: Array<{
    key: string;
    value: string;
  }>;
}

interface ShopifyImage {
  url?: string | null;
  altText?: string | null;
}

interface ShopifyMoney {
  amount?: string | null;
  currencyCode?: string | null;
}

interface ShopifyMoneySet {
  shopMoney?: ShopifyMoney | null;
  presentmentMoney?: ShopifyMoney | null;
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
    transactions?: Array<{
      kind?: string | null;
      status?: string | null;
    }> | null;
    refunds?: Array<{
        id: string;
        refundLineItems?: {
          nodes: Array<{
            quantity: number;
            lineItem?: {
              id: string;
            } | null;
          }>;
        } | null;
        transactions?: {
          edges: Array<{
            node: {
              status?: string | null;
            };
          }>;
        } | null;
      }> | null;
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
      return FinancialStatus.PaymentPending;
    case "VOIDED":
      return FinancialStatus.Voided;
    default:
      return FinancialStatus.Unknown;
  }
}

function hasPendingRefundTransaction(
  transactions?: Array<{ kind?: string | null; status?: string | null }> | null,
): boolean {
  return (
    transactions?.some(
      (transaction) =>
        transaction.kind === "REFUND" &&
        isPendingRefundTransactionStatus(transaction.status),
    ) ?? false
  );
}

function isPendingRefundTransactionStatus(status?: string | null): boolean {
  return ["PENDING", "AWAITING_RESPONSE", "PROCESSING"].includes(
    status ?? "",
  );
}

function normalizeFinancialStatus(
  order: NonNullable<ShopifyRefundOrderContextResponse["order"]>,
): FinancialStatus {
  const hasLineItemScopedPendingRefunds =
    collectPendingRefundQuantitiesByLineItemId(order).size > 0;

  if (
    hasPendingRefundTransaction(order.transactions) &&
    !hasLineItemScopedPendingRefunds
  ) {
    return FinancialStatus.RefundPending;
  }

  return mapFinancialStatus(order.displayFinancialStatus);
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

function normalizeOptionalString(value?: string | null): string | undefined {
  const normalizedValue = value?.trim();

  return normalizedValue ? normalizedValue : undefined;
}

function normalizeVariantOptions(
  selectedOptions?: Array<{
    name?: string | null;
    value?: string | null;
  }> | null,
): RefundLineItemOption[] | undefined {
  const options =
    selectedOptions
      ?.map((option) => ({
        name: normalizeOptionalString(option.name),
        value: normalizeOptionalString(option.value),
      }))
      .filter(
        (
          option,
        ): option is RefundLineItemOption =>
          option.name !== undefined && option.value !== undefined,
      ) ?? [];

  return options.length > 0 ? options : undefined;
}

function mapMoney(money?: ShopifyMoney | null): RefundMoney | undefined {
  const amount = normalizeOptionalString(money?.amount);
  const currencyCode = normalizeOptionalString(money?.currencyCode);

  return amount && currencyCode ? { amount, currencyCode } : undefined;
}

function mapUnitPrice(
  moneySet?: ShopifyMoneySet | null,
): RefundMoney | undefined {
  return (
    mapMoney(moneySet?.presentmentMoney) ?? mapMoney(moneySet?.shopMoney)
  );
}

function pickLineItemImage(lineItem: ShopifyAdminLineItem): ShopifyImage | null {
  return (
    lineItem.variant?.image ??
    lineItem.product?.featuredMedia?.preview?.image ??
    null
  );
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

function collectPendingRefundQuantitiesByLineItemId(
  order: NonNullable<ShopifyRefundOrderContextResponse["order"]>,
): Map<string, number> {
  const pendingRefundQuantitiesByLineItemId = new Map<string, number>();

  for (const refund of order.refunds ?? []) {
    const hasPendingTransaction =
      refund.transactions?.edges.some(({ node }) =>
        isPendingRefundTransactionStatus(node.status),
      ) ?? false;

    if (!hasPendingTransaction) {
      continue;
    }

    for (const refundLineItem of refund.refundLineItems?.nodes ?? []) {
      const lineItemId = refundLineItem.lineItem?.id;

      if (!lineItemId || refundLineItem.quantity <= 0) {
        continue;
      }

      pendingRefundQuantitiesByLineItemId.set(
        lineItemId,
        (pendingRefundQuantitiesByLineItemId.get(lineItemId) ?? 0) +
          refundLineItem.quantity,
      );
    }
  }

  return pendingRefundQuantitiesByLineItemId;
}

function mapAdminLineItemsToRefundContextLineItems(
  order: NonNullable<ShopifyRefundOrderContextResponse["order"]>,
  returnable: ShopifyReturnableFulfillmentsResponse,
  financialStatus: FinancialStatus,
): RefundContextLineItem[] {
  const returnableLineItems = collectReturnableLineItems(returnable);
  const pendingRefundQuantitiesByLineItemId =
    collectPendingRefundQuantitiesByLineItemId(order);
  const orderFulfillmentStatus = mapFulfillmentStatus(
    order.displayFulfillmentStatus,
  );

  return order.lineItems.nodes.map((lineItem) => {
    const returnableLineItem = returnableLineItems.get(lineItem.id);
    const pendingRefundQuantity =
      pendingRefundQuantitiesByLineItemId.get(lineItem.id);
    const image = pickLineItemImage(lineItem);
    const sku = normalizeOptionalString(lineItem.sku ?? lineItem.variant?.sku);
    const variantTitle = normalizeOptionalString(lineItem.variant?.title);
    const variantOptions = normalizeVariantOptions(
      lineItem.variant?.selectedOptions,
    );
    const imageUrl = normalizeOptionalString(image?.url);
    const imageAltText = normalizeOptionalString(image?.altText);
    const unitPrice = mapUnitPrice(lineItem.originalUnitPriceSet);

    return {
      lineItemId: lineItem.id,
      ...(returnableLineItem
        ? { fulfillmentLineItemId: returnableLineItem.fulfillmentLineItemId }
        : {}),
      ...(lineItem.title ? { title: lineItem.title } : {}),
      ...(sku ? { sku } : {}),
      ...(variantTitle ? { variantTitle } : {}),
      ...(variantOptions ? { variantOptions } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      ...(imageAltText ? { imageAltText } : {}),
      ...(unitPrice ? { unitPrice } : {}),
      returnableQuantity: returnableLineItem?.returnableQuantity ?? 0,
      ...(pendingRefundQuantity !== undefined
        ? { pendingRefundQuantity }
        : {}),
      category: lineItem.product?.category?.fullName ?? undefined,
      fulfillmentStatus: orderFulfillmentStatus,
      hasReturnableFulfillment: returnableLineItem !== undefined,
      alreadyRefunded:
        pendingRefundQuantity !== undefined
          ? false
          : financialStatus === FinancialStatus.Refunded ||
            (financialStatus === FinancialStatus.PartiallyRefunded &&
              lineItem.currentQuantity <= 0),
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
  const financialStatus = normalizeFinancialStatus(order);

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
  dependencies: LoadShopifyRefundContextDependencies,
): Promise<RefundContext> {
  // The policy engine needs both the order record and Shopify's separate
  // returnable-fulfillments view to decide whether a refund path is actually open.
  const orderResponse =
    await shopifyAdminFetch<ShopifyRefundOrderContextResponse>(
      REFUND_ORDER_CONTEXT_QUERY,
      { id: input.orderId },
      {
        env: dependencies.env,
        fetchImpl: dependencies.fetchImpl,
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
        env: dependencies.env,
        fetchImpl: dependencies.fetchImpl,
      },
    );

  return mapAdminOrderToRefundContext(
    orderResponse.order,
    returnableResponse,
    dependencies.now ?? new Date(),
  );
}

async function loadRefundContextFromMockShopify(
  input: RefundContextInput,
  dependencies: LoadShopifyRefundContextDependencies = {},
): Promise<RefundContext> {
  const order = MOCK_SHOPIFY_ORDERS[input.orderId];

  if (!order) {
    throw new Error(
      `No mock Shopify order exists for ${input.orderId}. ` +
        "Set USE_REAL_SHOPIFY=true with Shopify Admin env vars to fetch a real order instead.",
    );
  }

  return mapShopifyMockOrderToRefundContext(order, dependencies.now ?? new Date());
}

export function createMockShopifyRefundContextAdapter(
  dependencies: LoadShopifyRefundContextDependencies = {},
): RefundContextPlatformAdapter {
  return {
    platform: "shopify-mock",
    loadRefundContext(input) {
      return loadRefundContextFromMockShopify(input, dependencies);
    },
  };
}

export function createShopifyAdminRefundContextAdapter(
  dependencies: LoadShopifyRefundContextDependencies = {},
): RefundContextPlatformAdapter {
  return {
    platform: "shopify-admin",
    loadRefundContext(input) {
      if (!hasShopifyAdminConfig(dependencies.env)) {
        throw new Error(
          "USE_REAL_SHOPIFY=true requires SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN.",
        );
      }

      return loadRefundContextFromShopify(input, dependencies);
    },
  };
}

export function createRefundContextAdapter(
  dependencies: LoadShopifyRefundContextDependencies = {},
): RefundContextPlatformAdapter {
  return shouldUseRealShopify(dependencies.env)
    ? createShopifyAdminRefundContextAdapter(dependencies)
    : createMockShopifyRefundContextAdapter(dependencies);
}
