import {
  RefundActionValidationStatus,
  type RefundActionValidation,
} from "../../application/validate-refund-action.js";
import { SHOPIFY_REFUND_CREATE_MUTATION } from "./shopify-queries.js";

interface ShopifyRefundCreateLineItemInput {
  lineItemId: string;
  quantity: number;
}

interface ShopifyRefundCreateInput {
  orderId: string;
  refundLineItems: ShopifyRefundCreateLineItemInput[];
  transactions: [];
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

  const input: ShopifyRefundCreateInput = {
    orderId: validation.orderId,
    refundLineItems: validation.matchedLineItems.map((lineItem) => ({
      lineItemId: lineItem.lineItemId,
      quantity: lineItem.requestedQuantity,
    })),
    transactions: [],
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
