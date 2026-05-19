import type { RefundActionValidation } from "../../application/validate-refund-action.js";
import { buildShopifyRefundCreateGraphqlRequest } from "./build-refund-create-request.js";
import { hasShopifyAdminConfig } from "./shopify-admin.js";

export const ShopifyRefundActionExecutionStatus = {
  Succeeded: "succeeded",
  Failed: "failed",
} as const;

export type ShopifyRefundActionExecutionStatus =
  (typeof ShopifyRefundActionExecutionStatus)[keyof typeof ShopifyRefundActionExecutionStatus];

export interface ExecuteShopifyRefundActionInput {
  validation: RefundActionValidation;
  idempotencyKey: string;
  note?: string;
}

export interface ExecuteShopifyRefundActionDeps {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

export interface ShopifyRefundActionExecutedLineItem {
  lineItemId: string;
  quantity: number;
  title?: string;
}

export interface ShopifyRefundActionUserError {
  field?: string[] | null;
  message: string;
}

export interface ShopifyRefundActionResult {
  orderId: string;
  status: ShopifyRefundActionExecutionStatus;
  idempotencyKey: string;
  source: "mock" | "shopify";
  refundId?: string;
  totalRefunded?: {
    amount: string;
    currencyCode: string;
  };
  lineItems: ShopifyRefundActionExecutedLineItem[];
  userErrors: ShopifyRefundActionUserError[];
}

function shouldUseRealShopify(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.USE_REAL_SHOPIFY === "true";
}

function isRealRefundExecutionEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.ENABLE_REAL_REFUND_EXECUTION === "true";
}

function mapExecutedLineItems(
  validation: RefundActionValidation,
): ShopifyRefundActionExecutedLineItem[] {
  return validation.matchedLineItems.map((lineItem) => ({
    lineItemId: lineItem.lineItemId,
    quantity: lineItem.requestedQuantity,
    ...(lineItem.title ? { title: lineItem.title } : {}),
  }));
}

function executeMockShopifyRefundAction(
  input: ExecuteShopifyRefundActionInput,
): ShopifyRefundActionResult {
  const request = buildShopifyRefundCreateGraphqlRequest(input.validation, {
    idempotencyKey: input.idempotencyKey,
    note: input.note,
  });

  return {
    orderId: request.variables.input.orderId,
    status: ShopifyRefundActionExecutionStatus.Succeeded,
    idempotencyKey: request.variables.idempotencyKey,
    source: "mock",
    refundId: `mock://shopify/Refund/${encodeURIComponent(
      request.variables.idempotencyKey,
    )}`,
    lineItems: mapExecutedLineItems(input.validation),
    userErrors: [],
  };
}

async function executeRealShopifyRefundAction(): Promise<ShopifyRefundActionResult> {
  throw new Error(
    "Real Shopify refund execution requires suggestedRefund wiring before refundCreate.",
  );
}

export async function executeShopifyRefundAction(
  input: ExecuteShopifyRefundActionInput,
  deps: ExecuteShopifyRefundActionDeps = {},
): Promise<ShopifyRefundActionResult> {
  if (shouldUseRealShopify(deps.env)) {
    if (!hasShopifyAdminConfig(deps.env)) {
      throw new Error(
        "USE_REAL_SHOPIFY=true requires SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN.",
      );
    }

    if (!isRealRefundExecutionEnabled(deps.env)) {
      throw new Error(
        "Real Shopify refund execution requires ENABLE_REAL_REFUND_EXECUTION=true.",
      );
    }

    return executeRealShopifyRefundAction();
  }

  return executeMockShopifyRefundAction(input);
}
