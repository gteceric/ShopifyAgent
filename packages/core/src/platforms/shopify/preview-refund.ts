import type { ShopifyAdminClient } from "./shopify-admin.js";
import { SHOPIFY_REFUND_PREVIEW_QUERY } from "./shopify-queries.js";

export interface RefundPreviewLineItemInput {
  lineItemId: string;
  quantity: number;
}

export interface PreviewShopifyRefundInput {
  orderId: string;
  refundLineItems: RefundPreviewLineItemInput[];
}

export interface PreviewShopifyRefundDependencies {
  shopifyAdminClient: ShopifyAdminClient;
}

export interface RefundPreviewMoney {
  amount: string;
  currencyCode: string;
}

export interface RefundPreviewMoneyBag {
  shopMoney: RefundPreviewMoney;
  presentmentMoney: RefundPreviewMoney;
}

export interface ShopifyRefundPreviewLineItem {
  lineItemId: string;
  title?: string;
  quantity: number;
  price: RefundPreviewMoneyBag;
}

export interface ShopifyRefundPreviewTransaction {
  kind: string;
  gateway: string;
  amount: RefundPreviewMoneyBag;
  parentTransactionId?: string;
  maximumRefundable?: RefundPreviewMoneyBag;
}

export interface ShopifyRefundPreview {
  orderId: string;
  amount: RefundPreviewMoneyBag;
  maximumRefundable: RefundPreviewMoneyBag;
  subtotal: RefundPreviewMoneyBag;
  totalTax: RefundPreviewMoneyBag;
  refundLineItems: ShopifyRefundPreviewLineItem[];
  suggestedTransactions: ShopifyRefundPreviewTransaction[];
}

interface ShopifyRefundPreviewVariables extends Record<string, unknown> {
  orderId: string;
  refundLineItems: RefundPreviewLineItemInput[];
}

interface ShopifyAdminMoney {
  amount: string;
  currencyCode: string;
}

interface ShopifyAdminMoneyBag {
  shopMoney: ShopifyAdminMoney;
  presentmentMoney: ShopifyAdminMoney;
}

interface ShopifyAdminSuggestedRefundLineItem {
  lineItem: {
    id: string;
    title?: string | null;
  };
  quantity: number;
  priceSet: ShopifyAdminMoneyBag;
}

interface ShopifyAdminSuggestedRefundTransaction {
  kind: string;
  gateway: string;
  amountSet: ShopifyAdminMoneyBag;
  maximumRefundableSet?: ShopifyAdminMoneyBag | null;
  parentTransaction?: {
    id: string;
  } | null;
}

interface ShopifyAdminSuggestedRefund {
  amountSet: ShopifyAdminMoneyBag;
  maximumRefundableSet: ShopifyAdminMoneyBag;
  subtotalSet: ShopifyAdminMoneyBag;
  totalTaxSet: ShopifyAdminMoneyBag;
  refundLineItems: ShopifyAdminSuggestedRefundLineItem[];
  suggestedTransactions: ShopifyAdminSuggestedRefundTransaction[];
}

interface ShopifyRefundPreviewResponse {
  order?: {
    id: string;
    suggestedRefund?: ShopifyAdminSuggestedRefund | null;
  } | null;
}

function mapRefundPreviewMoney(
  money: ShopifyAdminMoney,
): RefundPreviewMoney {
  return {
    amount: money.amount,
    currencyCode: money.currencyCode,
  };
}

function mapRefundPreviewMoneyBag(
  moneyBag: ShopifyAdminMoneyBag,
): RefundPreviewMoneyBag {
  return {
    shopMoney: mapRefundPreviewMoney(moneyBag.shopMoney),
    presentmentMoney: mapRefundPreviewMoney(moneyBag.presentmentMoney),
  };
}

function mapRefundPreviewLineItem(
  lineItem: ShopifyAdminSuggestedRefundLineItem,
): ShopifyRefundPreviewLineItem {
  return {
    lineItemId: lineItem.lineItem.id,
    ...(lineItem.lineItem.title ? { title: lineItem.lineItem.title } : {}),
    quantity: lineItem.quantity,
    price: mapRefundPreviewMoneyBag(lineItem.priceSet),
  };
}

function mapRefundPreviewTransaction(
  transaction: ShopifyAdminSuggestedRefundTransaction,
): ShopifyRefundPreviewTransaction {
  return {
    kind: transaction.kind,
    gateway: transaction.gateway,
    amount: mapRefundPreviewMoneyBag(transaction.amountSet),
    ...(transaction.parentTransaction?.id
      ? { parentTransactionId: transaction.parentTransaction.id }
      : {}),
    ...(transaction.maximumRefundableSet
      ? {
          maximumRefundable: mapRefundPreviewMoneyBag(
            transaction.maximumRefundableSet,
          ),
        }
      : {}),
  };
}

function mapRefundPreview(
  orderId: string,
  suggestedRefund: ShopifyAdminSuggestedRefund,
): ShopifyRefundPreview {
  return {
    orderId,
    amount: mapRefundPreviewMoneyBag(suggestedRefund.amountSet),
    maximumRefundable: mapRefundPreviewMoneyBag(
      suggestedRefund.maximumRefundableSet,
    ),
    subtotal: mapRefundPreviewMoneyBag(suggestedRefund.subtotalSet),
    totalTax: mapRefundPreviewMoneyBag(suggestedRefund.totalTaxSet),
    refundLineItems: suggestedRefund.refundLineItems.map(
      mapRefundPreviewLineItem,
    ),
    suggestedTransactions: suggestedRefund.suggestedTransactions.map(
      mapRefundPreviewTransaction,
    ),
  };
}

export async function previewShopifyRefund(
  input: PreviewShopifyRefundInput,
  dependencies: PreviewShopifyRefundDependencies,
): Promise<ShopifyRefundPreview> {
  const variables: ShopifyRefundPreviewVariables = {
    orderId: input.orderId,
    refundLineItems: input.refundLineItems,
  };
  const response =
    await dependencies.shopifyAdminClient.fetch<ShopifyRefundPreviewResponse>(
      SHOPIFY_REFUND_PREVIEW_QUERY,
      variables,
    );

  if (!response.order) {
    throw new Error(`Shopify order ${input.orderId} was not found.`);
  }

  if (!response.order.suggestedRefund) {
    throw new Error(
      `Shopify order ${input.orderId} did not return a refund preview.`,
    );
  }

  return mapRefundPreview(response.order.id, response.order.suggestedRefund);
}
