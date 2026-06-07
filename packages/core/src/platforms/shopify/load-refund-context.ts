import {
  FinancialStatus,
  FulfillmentStatus,
} from "../../domain/refund-policy.types.js";
import {
  deriveShopifyRefundProcessingStatusFromTransactions,
  hasPendingShopifyOrderRefundTransaction,
  hasPendingShopifyRefundTransaction,
} from "./refund-processing-status.js";
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
  REFUND_ORDER_LINE_ITEMS_QUERY,
  REFUND_ORDER_REFUNDS_QUERY,
  REFUND_ORDER_SUMMARY_QUERY,
  REFUND_REFUND_LINE_ITEMS_QUERY,
  REFUND_RETURNABLE_FULFILLMENTS_QUERY,
  REFUND_RETURNABLE_FULFILLMENT_LINE_ITEMS_QUERY,
  REFUND_TRANSACTIONS_QUERY,
} from "./shopify-queries.js";
import {
  type ShopifyAdminClient,
} from "./shopify-admin.js";
import { normalizeOptionalString } from "../../shared/normalize-value.js";

export interface LoadShopifyRefundContextDependencies {
  shopifyAdminClient?: ShopifyAdminClient;
  env?: NodeJS.ProcessEnv;
  now?: Date;
}

export interface ShopifyAdminRefundContextDependencies
  extends LoadShopifyRefundContextDependencies {
  shopifyAdminClient: ShopifyAdminClient;
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

interface ShopifyPageInfo {
  hasNextPage: boolean;
  endCursor?: string | null;
}

interface ShopifyNodeConnection<T> {
  nodes: T[];
  pageInfo?: ShopifyPageInfo | null;
}

interface ShopifyEdgeConnection<T> {
  edges: Array<{
    node: T;
  }>;
  pageInfo?: ShopifyPageInfo | null;
}

interface ShopifyRefundLineItemNode {
  id?: string | null;
  quantity: number;
  subtotalSet?: ShopifyMoneySet | null;
  lineItem?: {
    id: string;
  } | null;
}

interface ShopifyRefundTransactionNode {
  id?: string | null;
  kind?: string | null;
  gateway?: string | null;
  status?: string | null;
  amountSet?: ShopifyMoneySet | null;
}

interface ShopifyAdminRefund {
  id: string;
  totalRefundedSet?: ShopifyMoneySet | null;
  refundLineItems?: ShopifyNodeConnection<ShopifyRefundLineItemNode> | null;
  transactions?: ShopifyEdgeConnection<ShopifyRefundTransactionNode> | null;
}

interface ShopifyReturnableFulfillmentLineItemNode {
  quantity: number;
  fulfillmentLineItem: {
    lineItem?: {
      id: string;
    } | null;
  } | null;
}

interface ShopifyReturnableFulfillmentNode {
  id: string;
  returnableFulfillmentLineItems: ShopifyNodeConnection<ShopifyReturnableFulfillmentLineItemNode>;
}

interface ShopifyAdminOrderSummary {
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
  fraudHoldFlag?: ShopifyMetafieldValue | null;
  manualReviewFlag?: ShopifyMetafieldValue | null;
  vipOverrideFlag?: ShopifyMetafieldValue | null;
}

interface ShopifyAdminRefundContextOrder extends ShopifyAdminOrderSummary {
  refunds?: ShopifyAdminRefund[] | null;
  lineItems: ShopifyNodeConnection<ShopifyAdminLineItem>;
}

interface ShopifyRefundOrderSummaryResponse {
  order: ShopifyAdminOrderSummary | null;
}

interface ShopifyOrderLineItemsResponse {
  order: {
    id: string;
    lineItems: ShopifyNodeConnection<ShopifyAdminLineItem>;
  } | null;
}

interface ShopifyOrderRefundsResponse {
  order: {
    id: string;
    refunds?: ShopifyAdminRefund[] | null;
  } | null;
}

interface ShopifyRefundLineItemsResponse {
  node: {
    id: string;
    refundLineItems: ShopifyNodeConnection<ShopifyRefundLineItemNode>;
  } | null;
}

interface ShopifyRefundTransactionsResponse {
  node: {
    id: string;
    transactions: ShopifyEdgeConnection<ShopifyRefundTransactionNode>;
  } | null;
}

interface ShopifyReturnableFulfillmentsResponse {
  returnableFulfillments: ShopifyNodeConnection<ShopifyReturnableFulfillmentNode>;
}

interface ShopifyReturnableFulfillmentLineItemsResponse {
  node: ShopifyReturnableFulfillmentNode | null;
}

export interface ShopifyRefundSyncLineItem {
  platformRefundLineItemId?: string;
  lineItemId: string;
  quantity: number;
  subtotal?: RefundMoney;
}

export interface ShopifyRefundSyncTransaction {
  transactionId: string;
  kind?: string;
  gateway?: string;
  status: string;
  amount?: RefundMoney;
}

export interface ShopifyRefundSyncRecord {
  refundId: string;
  status: string;
  totalRefunded?: RefundMoney;
  lineItems: ShopifyRefundSyncLineItem[];
  transactions: ShopifyRefundSyncTransaction[];
}

export interface ShopifyOrderRefundSyncData {
  context: RefundContext;
  refunds: ShopifyRefundSyncRecord[];
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

function normalizeFinancialStatus(
  order: ShopifyAdminRefundContextOrder,
): FinancialStatus {
  const hasLineItemScopedPendingRefunds =
    collectPendingRefundQuantitiesByLineItemId(order).size > 0;

  if (
    hasPendingShopifyOrderRefundTransaction(order.transactions) &&
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
        (option): option is RefundLineItemOption =>
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
  return mapMoney(moneySet?.presentmentMoney) ?? mapMoney(moneySet?.shopMoney);
}

function mapMoneySet(
  moneySet?: ShopifyMoneySet | null,
): RefundMoney | undefined {
  return mapMoney(moneySet?.presentmentMoney) ?? mapMoney(moneySet?.shopMoney);
}

function pickLineItemImage(
  lineItem: ShopifyAdminLineItem,
): ShopifyImage | null {
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

function collectReturnableQuantitiesByLineItemId(
  returnable: ShopifyReturnableFulfillmentsResponse,
): Map<string, number> {
  const returnableQuantitiesByLineItemId = new Map<string, number>();

  for (const fulfillment of returnable.returnableFulfillments.nodes) {
    for (const lineItem of fulfillment.returnableFulfillmentLineItems.nodes) {
      const lineItemId = lineItem.fulfillmentLineItem?.lineItem?.id;

      if (!lineItemId || lineItem.quantity <= 0) {
        continue;
      }

      returnableQuantitiesByLineItemId.set(lineItemId, lineItem.quantity);
    }
  }

  return returnableQuantitiesByLineItemId;
}

function collectPendingRefundQuantitiesByLineItemId(
  order: ShopifyAdminRefundContextOrder,
): Map<string, number> {
  const pendingRefundQuantitiesByLineItemId = new Map<string, number>();

  for (const refund of order.refunds ?? []) {
    const refundTransactions =
      refund.transactions?.edges.map(({ node }) => node) ?? [];

    if (!hasPendingShopifyRefundTransaction(refundTransactions)) {
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

function mapShopifyRefundLineItemsToSyncLineItems(
  refund: ShopifyAdminRefund,
): ShopifyRefundSyncLineItem[] {
  const lineItems: ShopifyRefundSyncLineItem[] = [];

  for (const refundLineItem of refund.refundLineItems?.nodes ?? []) {
    const lineItemId = refundLineItem.lineItem?.id;

    if (!lineItemId || refundLineItem.quantity <= 0) {
      continue;
    }

    const subtotal = mapMoneySet(refundLineItem.subtotalSet);
    const platformRefundLineItemId = normalizeOptionalString(refundLineItem.id);

    lineItems.push({
      ...(platformRefundLineItemId ? { platformRefundLineItemId } : {}),
      lineItemId,
      quantity: refundLineItem.quantity,
      ...(subtotal ? { subtotal } : {}),
    });
  }

  return lineItems;
}

function mapShopifyRefundTransactionsToSyncTransactions(
  refund: ShopifyAdminRefund,
): ShopifyRefundSyncTransaction[] {
  const transactions: ShopifyRefundSyncTransaction[] = [];

  for (const { node } of refund.transactions?.edges ?? []) {
    const transactionId = normalizeOptionalString(node.id);

    if (!transactionId) {
      continue;
    }

    const kind = normalizeOptionalString(node.kind);
    const gateway = normalizeOptionalString(node.gateway);
    const status = normalizeOptionalString(node.status) ?? "unknown";
    const amount = mapMoneySet(node.amountSet);

    transactions.push({
      transactionId,
      ...(kind ? { kind } : {}),
      ...(gateway ? { gateway } : {}),
      status,
      ...(amount ? { amount } : {}),
    });
  }

  return transactions;
}

function mapShopifyRefundsToSyncRecords(
  refunds: ShopifyAdminRefund[],
): ShopifyRefundSyncRecord[] {
  return refunds.map((refund) => {
    const transactions = mapShopifyRefundTransactionsToSyncTransactions(refund);
    const lineItems = mapShopifyRefundLineItemsToSyncLineItems(refund);
    const totalRefunded = mapMoneySet(refund.totalRefundedSet);
    const status =
      deriveShopifyRefundProcessingStatusFromTransactions(transactions);

    return {
      refundId: refund.id,
      status,
      ...(totalRefunded ? { totalRefunded } : {}),
      lineItems,
      transactions,
    };
  });
}

function mapAdminLineItemsToRefundContextLineItems(
  order: ShopifyAdminRefundContextOrder,
  returnable: ShopifyReturnableFulfillmentsResponse,
  financialStatus: FinancialStatus,
): RefundContextLineItem[] {
  const returnableQuantitiesByLineItemId =
    collectReturnableQuantitiesByLineItemId(returnable);
  const pendingRefundQuantitiesByLineItemId =
    collectPendingRefundQuantitiesByLineItemId(order);
  const orderFulfillmentStatus = mapFulfillmentStatus(
    order.displayFulfillmentStatus,
  );

  return order.lineItems.nodes.map((lineItem) => {
    const returnableQuantity = returnableQuantitiesByLineItemId.get(lineItem.id);
    const pendingRefundQuantity = pendingRefundQuantitiesByLineItemId.get(
      lineItem.id,
    );
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
      ...(lineItem.title ? { title: lineItem.title } : {}),
      ...(sku ? { sku } : {}),
      ...(variantTitle ? { variantTitle } : {}),
      ...(variantOptions ? { variantOptions } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      ...(imageAltText ? { imageAltText } : {}),
      ...(unitPrice ? { unitPrice } : {}),
      returnableQuantity: returnableQuantity ?? 0,
      ...(pendingRefundQuantity !== undefined ? { pendingRefundQuantity } : {}),
      category: lineItem.product?.category?.fullName ?? undefined,
      fulfillmentStatus: orderFulfillmentStatus,
      hasReturnableFulfillment: returnableQuantity !== undefined,
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

function getNextPageCursor<T>(
  connection:
    | ShopifyNodeConnection<T>
    | ShopifyEdgeConnection<T>
    | undefined
    | null,
): string | undefined {
  const pageInfo = connection?.pageInfo;

  if (!pageInfo?.hasNextPage) {
    return undefined;
  }

  return pageInfo.endCursor ?? undefined;
}

async function loadShopifyOrderSummaryForRefund(
  orderId: string,
  shopifyAdminClient: ShopifyAdminClient,
): Promise<ShopifyAdminOrderSummary> {
  const response =
    await shopifyAdminClient.fetch<ShopifyRefundOrderSummaryResponse>(
      REFUND_ORDER_SUMMARY_QUERY,
      { id: orderId },
    );

  if (!response.order) {
    throw new Error(`No Shopify order exists for ${orderId}.`);
  }

  return response.order;
}

async function loadShopifyOrderLineItems(
  orderId: string,
  shopifyAdminClient: ShopifyAdminClient,
): Promise<ShopifyAdminLineItem[]> {
  const lineItems: ShopifyAdminLineItem[] = [];
  let cursor: string | undefined;

  do {
    const response =
      await shopifyAdminClient.fetch<ShopifyOrderLineItemsResponse>(
        REFUND_ORDER_LINE_ITEMS_QUERY,
        { id: orderId, after: cursor },
      );

    if (!response.order) {
      throw new Error(`No Shopify order exists for ${orderId}.`);
    }

    lineItems.push(...response.order.lineItems.nodes);
    cursor = getNextPageCursor(response.order.lineItems);
  } while (cursor);

  return lineItems;
}

async function loadShopifyRefundLineItems(
  refundId: string,
  firstPage:
    | ShopifyNodeConnection<ShopifyRefundLineItemNode>
    | undefined
    | null,
  shopifyAdminClient: ShopifyAdminClient,
): Promise<ShopifyNodeConnection<ShopifyRefundLineItemNode>> {
  const nodes = [...(firstPage?.nodes ?? [])];
  let cursor = getNextPageCursor(firstPage);

  while (cursor) {
    const response =
      await shopifyAdminClient.fetch<ShopifyRefundLineItemsResponse>(
        REFUND_REFUND_LINE_ITEMS_QUERY,
        { id: refundId, after: cursor },
      );

    if (!response.node) {
      throw new Error(`No Shopify refund exists for ${refundId}.`);
    }

    nodes.push(...response.node.refundLineItems.nodes);
    cursor = getNextPageCursor(response.node.refundLineItems);
  }

  return { nodes };
}

async function loadShopifyRefundTransactions(
  refundId: string,
  firstPage:
    | ShopifyEdgeConnection<ShopifyRefundTransactionNode>
    | undefined
    | null,
  shopifyAdminClient: ShopifyAdminClient,
): Promise<ShopifyEdgeConnection<ShopifyRefundTransactionNode>> {
  const edges = [...(firstPage?.edges ?? [])];
  let cursor = getNextPageCursor(firstPage);

  while (cursor) {
    const response =
      await shopifyAdminClient.fetch<ShopifyRefundTransactionsResponse>(
        REFUND_TRANSACTIONS_QUERY,
        { id: refundId, after: cursor },
      );

    if (!response.node) {
      throw new Error(`No Shopify refund exists for ${refundId}.`);
    }

    edges.push(...response.node.transactions.edges);
    cursor = getNextPageCursor(response.node.transactions);
  }

  return { edges };
}

async function loadShopifyOrderRefunds(
  orderId: string,
  shopifyAdminClient: ShopifyAdminClient,
): Promise<ShopifyAdminRefund[]> {
  const response =
    await shopifyAdminClient.fetch<ShopifyOrderRefundsResponse>(
      REFUND_ORDER_REFUNDS_QUERY,
      { id: orderId },
    );

  if (!response.order) {
    throw new Error(`No Shopify order exists for ${orderId}.`);
  }

  const refunds: ShopifyAdminRefund[] = [];

  for (const refund of response.order.refunds ?? []) {
    const refundLineItems = await loadShopifyRefundLineItems(
      refund.id,
      refund.refundLineItems,
      shopifyAdminClient,
    );
    const transactions = await loadShopifyRefundTransactions(
      refund.id,
      refund.transactions,
      shopifyAdminClient,
    );

    refunds.push({
      ...refund,
      refundLineItems,
      transactions,
    });
  }

  return refunds;
}

async function loadShopifyReturnableFulfillmentLineItems(
  fulfillmentId: string,
  firstPage:
    | ShopifyNodeConnection<ShopifyReturnableFulfillmentLineItemNode>
    | undefined
    | null,
  shopifyAdminClient: ShopifyAdminClient,
): Promise<ShopifyNodeConnection<ShopifyReturnableFulfillmentLineItemNode>> {
  const nodes = [...(firstPage?.nodes ?? [])];
  let cursor = getNextPageCursor(firstPage);

  while (cursor) {
    const response =
      await shopifyAdminClient.fetch<ShopifyReturnableFulfillmentLineItemsResponse>(
        REFUND_RETURNABLE_FULFILLMENT_LINE_ITEMS_QUERY,
        { id: fulfillmentId, after: cursor },
      );

    if (!response.node) {
      throw new Error(
        `No Shopify returnable fulfillment exists for ${fulfillmentId}.`,
      );
    }

    nodes.push(...response.node.returnableFulfillmentLineItems.nodes);
    cursor = getNextPageCursor(response.node.returnableFulfillmentLineItems);
  }

  return { nodes };
}

async function loadShopifyReturnableFulfillments(
  orderId: string,
  shopifyAdminClient: ShopifyAdminClient,
): Promise<ShopifyReturnableFulfillmentsResponse> {
  const fulfillments: ShopifyReturnableFulfillmentNode[] = [];
  let cursor: string | undefined;

  do {
    const response =
      await shopifyAdminClient.fetch<ShopifyReturnableFulfillmentsResponse>(
        REFUND_RETURNABLE_FULFILLMENTS_QUERY,
        { orderId, after: cursor },
      );

    for (const fulfillment of response.returnableFulfillments.nodes) {
      const returnableFulfillmentLineItems =
        await loadShopifyReturnableFulfillmentLineItems(
          fulfillment.id,
          fulfillment.returnableFulfillmentLineItems,
          shopifyAdminClient,
        );

      fulfillments.push({
        ...fulfillment,
        returnableFulfillmentLineItems,
      });
    }

    cursor = getNextPageCursor(response.returnableFulfillments);
  } while (cursor);

  return {
    returnableFulfillments: {
      nodes: fulfillments,
    },
  };
}

interface CombineShopifyRefundContextPartsInput {
  orderSummary: ShopifyAdminOrderSummary;
  lineItems: ShopifyAdminLineItem[];
  refunds: ShopifyAdminRefund[];
}

function combineShopifyRefundContextParts(
  input: CombineShopifyRefundContextPartsInput,
): ShopifyAdminRefundContextOrder {
  return {
    ...input.orderSummary,
    lineItems: {
      nodes: input.lineItems,
    },
    refunds: input.refunds,
  };
}

interface LoadShopifyRefundContextPartsInput {
  orderId: string;
  shopifyAdminClient: ShopifyAdminClient;
}

interface ShopifyRefundContextParts {
  order: ShopifyAdminRefundContextOrder;
  returnableFulfillments: ShopifyReturnableFulfillmentsResponse;
}

async function loadShopifyRefundContextParts(
  input: LoadShopifyRefundContextPartsInput,
): Promise<ShopifyRefundContextParts> {
  const orderSummary = await loadShopifyOrderSummaryForRefund(
    input.orderId,
    input.shopifyAdminClient,
  );
  const lineItems = await loadShopifyOrderLineItems(
    input.orderId,
    input.shopifyAdminClient,
  );
  const refunds = await loadShopifyOrderRefunds(
    input.orderId,
    input.shopifyAdminClient,
  );
  const returnableFulfillments = await loadShopifyReturnableFulfillments(
    input.orderId,
    input.shopifyAdminClient,
  );
  const combineContextPartsInput: CombineShopifyRefundContextPartsInput = {
    orderSummary,
    lineItems,
    refunds,
  };
  const order = combineShopifyRefundContextParts(combineContextPartsInput);

  return {
    order,
    returnableFulfillments,
  };
}

// Map Shopify order context into the platform-neutral refund context.
export function mapAdminOrderToRefundContext(
  order: ShopifyAdminRefundContextOrder,
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

// individual api to load order summary, line items (pagination), refunds (pagination), returnable fulfillments (pagination)

async function loadRefundContextFromShopify(
  input: RefundContextInput,
  dependencies: ShopifyAdminRefundContextDependencies,
): Promise<RefundContext> {
  const contextPartsInput: LoadShopifyRefundContextPartsInput = {
    orderId: input.orderId,
    shopifyAdminClient: dependencies.shopifyAdminClient,
  };
  const contextParts = await loadShopifyRefundContextParts(contextPartsInput);

  return mapAdminOrderToRefundContext(
    contextParts.order,
    contextParts.returnableFulfillments,
    dependencies.now ?? new Date(),
  );
}

export async function loadShopifyOrderRefundSyncData(
  input: RefundContextInput,
  dependencies: ShopifyAdminRefundContextDependencies,
): Promise<ShopifyOrderRefundSyncData> {
  const contextPartsInput: LoadShopifyRefundContextPartsInput = {
    orderId: input.orderId,
    shopifyAdminClient: dependencies.shopifyAdminClient,
  };
  const contextParts = await loadShopifyRefundContextParts(contextPartsInput);
  const context = mapAdminOrderToRefundContext(
    contextParts.order,
    contextParts.returnableFulfillments,
    dependencies.now ?? new Date(),
  );
  const refunds = mapShopifyRefundsToSyncRecords(
    contextParts.order.refunds ?? [],
  );

  return {
    context,
    refunds,
  };
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

  return mapShopifyMockOrderToRefundContext(
    order,
    dependencies.now ?? new Date(),
  );
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
  dependencies: ShopifyAdminRefundContextDependencies,
): RefundContextPlatformAdapter {
  return {
    platform: "shopify-admin",
    loadRefundContext(input) {
      return loadRefundContextFromShopify(input, dependencies);
    },
  };
}

export function createShopifyRefundContextAdapter(
  dependencies: LoadShopifyRefundContextDependencies = {},
): RefundContextPlatformAdapter {
  if (!shouldUseRealShopify(dependencies.env)) {
    return createMockShopifyRefundContextAdapter(dependencies);
  }

  if (!dependencies.shopifyAdminClient) {
    throw new Error("Real Shopify refund context requires ShopifyAdminClient.");
  }

  return createShopifyAdminRefundContextAdapter({
    ...dependencies,
    shopifyAdminClient: dependencies.shopifyAdminClient,
  });
}
