import { shopifyAdminFetch } from "./shopify-admin.js";
import type { ShopifyAdminFetchOptions } from "./shopify-admin.js";
import { SHOPIFY_SUGGESTED_REFUND_QUERY } from "./shopify-queries.js";

export interface SuggestedRefundLineItemInput {
  lineItemId: string;
  quantity: number;
}

export interface LoadShopifySuggestedRefundInput {
  orderId: string;
  refundLineItems: SuggestedRefundLineItemInput[];
}

export interface LoadShopifySuggestedRefundDeps {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

export interface SuggestedRefundMoney {
  amount: string;
  currencyCode: string;
}

export interface SuggestedRefundMoneyBag {
  shopMoney: SuggestedRefundMoney;
  presentmentMoney: SuggestedRefundMoney;
}

export interface ShopifySuggestedRefundLineItem {
  lineItemId: string;
  title?: string;
  quantity: number;
  price: SuggestedRefundMoneyBag;
}

export interface ShopifySuggestedRefundTransaction {
  kind: string;
  gateway: string;
  amount: SuggestedRefundMoneyBag;
  parentTransactionId?: string;
  maximumRefundable?: SuggestedRefundMoneyBag;
}

export interface ShopifySuggestedRefund {
  orderId: string;
  amount: SuggestedRefundMoneyBag;
  maximumRefundable: SuggestedRefundMoneyBag;
  subtotal: SuggestedRefundMoneyBag;
  totalTax: SuggestedRefundMoneyBag;
  refundLineItems: ShopifySuggestedRefundLineItem[];
  suggestedTransactions: ShopifySuggestedRefundTransaction[];
}

interface ShopifySuggestedRefundVariables extends Record<string, unknown> {
  orderId: string;
  refundLineItems: SuggestedRefundLineItemInput[];
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

interface ShopifySuggestedRefundResponse {
  order?: {
    id: string;
    suggestedRefund?: ShopifyAdminSuggestedRefund | null;
  } | null;
}

function mapSuggestedRefundMoney(
  money: ShopifyAdminMoney,
): SuggestedRefundMoney {
  return {
    amount: money.amount,
    currencyCode: money.currencyCode,
  };
}

function mapSuggestedRefundMoneyBag(
  moneyBag: ShopifyAdminMoneyBag,
): SuggestedRefundMoneyBag {
  return {
    shopMoney: mapSuggestedRefundMoney(moneyBag.shopMoney),
    presentmentMoney: mapSuggestedRefundMoney(moneyBag.presentmentMoney),
  };
}

function mapSuggestedRefundLineItem(
  lineItem: ShopifyAdminSuggestedRefundLineItem,
): ShopifySuggestedRefundLineItem {
  return {
    lineItemId: lineItem.lineItem.id,
    ...(lineItem.lineItem.title ? { title: lineItem.lineItem.title } : {}),
    quantity: lineItem.quantity,
    price: mapSuggestedRefundMoneyBag(lineItem.priceSet),
  };
}

function mapSuggestedRefundTransaction(
  transaction: ShopifyAdminSuggestedRefundTransaction,
): ShopifySuggestedRefundTransaction {
  return {
    kind: transaction.kind,
    gateway: transaction.gateway,
    amount: mapSuggestedRefundMoneyBag(transaction.amountSet),
    ...(transaction.parentTransaction?.id
      ? { parentTransactionId: transaction.parentTransaction.id }
      : {}),
    ...(transaction.maximumRefundableSet
      ? {
          maximumRefundable: mapSuggestedRefundMoneyBag(
            transaction.maximumRefundableSet,
          ),
        }
      : {}),
  };
}

function mapSuggestedRefund(
  orderId: string,
  suggestedRefund: ShopifyAdminSuggestedRefund,
): ShopifySuggestedRefund {
  return {
    orderId,
    amount: mapSuggestedRefundMoneyBag(suggestedRefund.amountSet),
    maximumRefundable: mapSuggestedRefundMoneyBag(
      suggestedRefund.maximumRefundableSet,
    ),
    subtotal: mapSuggestedRefundMoneyBag(suggestedRefund.subtotalSet),
    totalTax: mapSuggestedRefundMoneyBag(suggestedRefund.totalTaxSet),
    refundLineItems: suggestedRefund.refundLineItems.map(
      mapSuggestedRefundLineItem,
    ),
    suggestedTransactions: suggestedRefund.suggestedTransactions.map(
      mapSuggestedRefundTransaction,
    ),
  };
}

export async function loadShopifySuggestedRefund(
  input: LoadShopifySuggestedRefundInput,
  deps: LoadShopifySuggestedRefundDeps = {},
): Promise<ShopifySuggestedRefund> {
  const variables: ShopifySuggestedRefundVariables = {
    orderId: input.orderId,
    refundLineItems: input.refundLineItems,
  };
  const shopifyAdminOptions: ShopifyAdminFetchOptions = {
    env: deps.env,
    fetchImpl: deps.fetchImpl,
  };
  const response = await shopifyAdminFetch<ShopifySuggestedRefundResponse>(
    SHOPIFY_SUGGESTED_REFUND_QUERY,
    variables,
    shopifyAdminOptions,
  );

  if (!response.order) {
    throw new Error(`Shopify order ${input.orderId} was not found.`);
  }

  if (!response.order.suggestedRefund) {
    throw new Error(
      `Shopify order ${input.orderId} did not return a suggested refund.`,
    );
  }

  return mapSuggestedRefund(response.order.id, response.order.suggestedRefund);
}
