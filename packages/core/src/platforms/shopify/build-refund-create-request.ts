import {
  RefundActionValidationStatus,
  type RefundActionValidation,
} from "../../application/validate-refund-action.js";
import type { RefundPaymentTransaction } from "./load-order-transactions.js";
import { SHOPIFY_REFUND_CREATE_MUTATION } from "./shopify-queries.js";

interface ShopifyRefundCreateLineItemInput {
  lineItemId: string;
  quantity: number;
}

export interface ShopifyRefundTransactionInput {
  orderId: string;
  parentId: string;
  gateway: string;
  kind: "REFUND";
  amount: string;
}

interface ShopifyRefundCreateInput {
  orderId: string;
  refundLineItems: ShopifyRefundCreateLineItemInput[];
  transactions: ShopifyRefundTransactionInput[];
  note?: string;
}

interface ShopifyRefundCreateMutationVariables extends Record<string, unknown> {
  input: ShopifyRefundCreateInput;
  idempotencyKey: string;
}

export interface ShopifyRefundCreateGraphqlRequest {
  query: string;
  variables: ShopifyRefundCreateMutationVariables;
}

export function buildShopifyRefundCreateGraphqlRequest(
  validation: RefundActionValidation,
  options: {
    idempotencyKey: string;
    refundTransactionInputs?: ShopifyRefundTransactionInput[];
    note?: string;
  },
): ShopifyRefundCreateGraphqlRequest {
  const idempotencyKey = options.idempotencyKey.trim();

  if (validation.status !== RefundActionValidationStatus.Ready) {
    throw new Error(
      "Cannot build Shopify refundCreate request unless refund action validation is ready.",
    );
  }

  if (validation.matchedLineItems.length === 0) {
    throw new Error(
      "Cannot build Shopify refundCreate request without matched line items.",
    );
  }

  if (!idempotencyKey) {
    throw new Error(
      "Cannot build Shopify refundCreate request without an idempotency key.",
    );
  }

  const refundTransactionInputs = options.refundTransactionInputs ?? [];
  const input: ShopifyRefundCreateInput = {
    orderId: validation.orderId,
    refundLineItems: validation.matchedLineItems.map((lineItem) => ({
      lineItemId: lineItem.lineItemId,
      quantity: lineItem.requestedQuantity,
    })),
    transactions: refundTransactionInputs,
    ...(options.note ? { note: options.note } : {}),
  };

  return {
    query: SHOPIFY_REFUND_CREATE_MUTATION,
    variables: {
      input,
      idempotencyKey,
    },
  };
}

export function buildRefundTransactionInputs(
  input: {
    orderId: string;
    refundAmount: string;
    paymentTransactions: RefundPaymentTransaction[];
  },
): ShopifyRefundTransactionInput[] {
  const refundablePaymentTransactions = input.paymentTransactions.filter(
    (transaction) =>
      ["SALE", "CAPTURE"].includes(transaction.kind) &&
      transaction.status === "SUCCESS",
  );

  if (refundablePaymentTransactions.length === 0) {
    throw new Error(
      "Cannot build refund transaction inputs because no successful payment transaction was found.",
    );
  }

  if (refundablePaymentTransactions.length > 1) {
    throw new Error(
      "Cannot build refund transaction inputs because multiple successful payment transactions were found.",
    );
  }

  const paymentTransaction = refundablePaymentTransactions[0]!;

  return [
    {
      orderId: input.orderId,
      parentId: paymentTransaction.id,
      gateway: paymentTransaction.gateway,
      kind: "REFUND",
      amount: input.refundAmount,
    },
  ];
}
