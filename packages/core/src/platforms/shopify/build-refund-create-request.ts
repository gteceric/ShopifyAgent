import {
  RefundActionValidationStatus,
  type RefundActionValidation,
} from "../../application/validate-refund-action.js";
import type {
  ShopifyRefundPreview,
  ShopifyRefundPreviewTransaction,
} from "./preview-refund.js";
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

export interface ResolveRefundTransactionInputsInput {
  orderId: string;
  refundPreview: ShopifyRefundPreview;
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

function mapPreviewTransactionToRefundTransactionInput(
  orderId: string,
  transaction: ShopifyRefundPreviewTransaction,
): ShopifyRefundTransactionInput {
  if (!transaction.parentTransactionId) {
    throw new Error(
      "Cannot build refund transaction input because Shopify did not return a parent transaction.",
    );
  }

  return {
    orderId,
    parentId: transaction.parentTransactionId,
    gateway: transaction.gateway,
    kind: "REFUND",
    amount: transaction.amount.shopMoney.amount,
  };
}

export function resolveRefundTransactionInputs(
  input: ResolveRefundTransactionInputsInput,
): ShopifyRefundTransactionInput[] {
  if (input.refundPreview.suggestedTransactions.length === 0) {
    throw new Error(
      "Cannot build refund transaction inputs because Shopify did not return suggested transactions.",
    );
  }

  return input.refundPreview.suggestedTransactions.map((transaction) =>
    mapPreviewTransactionToRefundTransactionInput(input.orderId, transaction),
  );
}
