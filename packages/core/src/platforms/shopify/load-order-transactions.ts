import { shopifyAdminFetch } from "./shopify-admin.js";
import type { ShopifyAdminFetchOptions } from "./shopify-admin.js";
import { SHOPIFY_ORDER_TRANSACTIONS_QUERY } from "./shopify-queries.js";

export interface LoadShopifyOrderTransactionsInput {
  orderId: string;
  first?: number;
}

export interface LoadShopifyOrderTransactionsDeps {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

export interface RefundPaymentMoney {
  amount: string;
  currencyCode: string;
}

export interface RefundPaymentTransaction {
  id: string;
  kind: string;
  status: string;
  gateway: string;
  test: boolean;
  shopAmount: RefundPaymentMoney;
  presentmentAmount: RefundPaymentMoney;
  maximumRefundable?: RefundPaymentMoney;
  parentTransactionId?: string;
}

interface ShopifyOrderTransactionsResponse {
  order: {
    id: string;
    transactions: ShopifyAdminOrderTransaction[];
  } | null;
}

interface ShopifyAdminOrderTransaction {
  id: string;
  kind: string;
  status: string;
  gateway: string;
  test: boolean;
  parentTransaction?: {
    id: string;
  } | null;
  amountSet: {
    shopMoney: RefundPaymentMoney;
    presentmentMoney: RefundPaymentMoney;
  };
  maximumRefundableV2?: RefundPaymentMoney | null;
}

interface ShopifyOrderTransactionsVariables extends Record<string, unknown> {
  orderId: string;
  first: number;
}

const DEFAULT_TRANSACTION_LIMIT = 50;

// normalization
function mapShopifyOrderTransaction(
  transaction: ShopifyAdminOrderTransaction,
): RefundPaymentTransaction {
  return {
    id: transaction.id,
    kind: transaction.kind,
    status: transaction.status,
    gateway: transaction.gateway,
    test: transaction.test,
    shopAmount: transaction.amountSet.shopMoney,
    presentmentAmount: transaction.amountSet.presentmentMoney,
    ...(transaction.maximumRefundableV2
      ? { maximumRefundable: transaction.maximumRefundableV2 }
      : {}),
    ...(transaction.parentTransaction?.id
      ? { parentTransactionId: transaction.parentTransaction.id }
      : {}),
  };
}

export async function loadShopifyOrderTransactions(
  input: LoadShopifyOrderTransactionsInput,
  deps: LoadShopifyOrderTransactionsDeps = {},
): Promise<RefundPaymentTransaction[]> {
  const variables: ShopifyOrderTransactionsVariables = {
    orderId: input.orderId,
    first: input.first ?? DEFAULT_TRANSACTION_LIMIT,
  };
  const shopifyAdminOptions: ShopifyAdminFetchOptions = {
    env: deps.env,
    fetchImpl: deps.fetchImpl,
  };
  const response = await shopifyAdminFetch<ShopifyOrderTransactionsResponse>(
    SHOPIFY_ORDER_TRANSACTIONS_QUERY,
    variables,
    shopifyAdminOptions,
  );

  if (!response.order) {
    throw new Error(`No Shopify order exists for ${input.orderId}.`);
  }

  return response.order.transactions.map(mapShopifyOrderTransaction);
}
